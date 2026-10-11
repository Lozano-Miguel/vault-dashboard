"""The sampling loops. Holds the live snapshot and aggregates each history window.

Two daemon threads: "local" (host metrics every 3 s, history, prune) and "network"
(service checks, weather) so slow network calls never delay the host readings.
"""
import logging
import os
import threading
import time

from . import host
from .checks import run_checks
from .events import (
    boot_events, initial_service_state, service_events, temp_events, temp_level,
    throttle_events, update_service, wifi_events, wifi_state,
)
from .weather import Weather

log = logging.getLogger("vault.sampler")
PAGE_KB = os.sysconf("SC_PAGE_SIZE") // 1024


class Sampler:
    HOST_INTERVAL_S = 3
    WEATHER_INTERVAL_S = 1800
    PRUNE_INTERVAL_S = 86400

    def __init__(self, cfg, store, *, checker=run_checks, weather=None, clock=time.time):
        self.cfg, self.store, self.checker, self.clock = cfg, store, checker, clock
        self.weather = weather or Weather(cfg.latitude, cfg.longitude)
        self.lock = threading.Lock()
        now = clock()
        self.services = {s.id: initial_service_state(now) for s in cfg.services}
        self.live = {}
        self.temp_level = "normal"
        self.wifi_state = None
        self.prev_cpu = None
        self.prev_procs = None
        self.prev_net = None
        self.last_throttle_raw = None
        self.last_throttle_event = None
        self.throttle_readable = False  # unknown until a tick reads the counter
        self.throttle_base = 0
        self.window_throttle = 0
        self.ticker = {}
        self._reset_window()

    def _reset_window(self):
        self.win_temps, self.win_cpu = [], []
        self.win_services = {s.id: [0, 0, 0, 0] for s in self.cfg.services}  # up, total, ms_sum, ms_n

    def _emit(self, events, now):
        for e in events:
            self.store.add_event(int(now), e.kind, e.level, e.text)
            log.info("event: %s", e.text)

    def start(self):
        now = self.clock()
        boot = host.read_boot_time(self.cfg.host_proc, now)
        last = self.store.get_meta("boot_time")
        self._emit(boot_events(int(last) if last else None, boot), now)
        if boot is not None:
            self.store.set_meta("boot_time", str(boot))
        self.throttle_base = self.store.throttle_today(int(now), self.cfg.tz)
        self.ticker = self.store.ticker(int(now), self.cfg.tz)

    def _net_rate(self, net, now):
        prev = self.prev_net
        self.prev_net = (net, now) if net else None
        if not net or not prev:
            return None
        (rx0, tx0), t0 = prev
        dt = now - t0
        if dt <= 0 or net[0] < rx0 or net[1] < tx0:
            return None
        return {"rx_bps": int((net[0] - rx0) / dt), "tx_bps": int((net[1] - tx0) / dt)}

    def tick_host(self):
        now, c = self.clock(), self.cfg
        temp = host.read_cpu_temp(c.host_sys, c.thermal_zone)
        cpu_times = host.read_cpu_times(c.host_proc)
        wifi = host.read_wifi(c.host_proc, c.wifi_iface)
        raw_throttle = host.read_throttle_count(c.host_sys)
        mem = host.read_meminfo(c.host_proc)
        disk = host.read_disk(c.disk_path)
        procs = host.read_processes(c.host_proc)
        total_delta = cpu_times[1] - self.prev_cpu[1] if cpu_times and self.prev_cpu else None
        top = (host.top_processes(self.prev_procs, procs, total_delta, mem[1] * 1024 if mem else 0, PAGE_KB)
               if procs is not None else None)
        live = {
            "cpu_temp": temp,
            "cpu_pct": host.cpu_percent(self.prev_cpu, cpu_times),
            "load": host.read_loadavg(c.host_proc),
            "mem_mb": list(mem) if mem else None,
            "disk_gb": list(disk) if disk else None,
            "boot_time": host.read_boot_time(c.host_proc, now),
            "wifi": wifi,
            "net": self._net_rate(host.read_net_bytes(c.host_proc, c.wifi_iface), now),
            "top": top,
            "procs": len(procs) if procs is not None else None,
        }
        self.prev_cpu = cpu_times
        self.prev_procs = procs
        events = []
        with self.lock:
            prev_today = self.throttle_base + self.window_throttle
            self.throttle_readable = raw_throttle is not None
            if raw_throttle is not None:
                last = self.last_throttle_raw
                if last is not None:
                    self.window_throttle += raw_throttle - last if raw_throttle >= last else raw_throttle
                self.last_throttle_raw = raw_throttle
            throttled = throttle_events(prev_today, self.throttle_base + self.window_throttle,
                                        now, self.last_throttle_event)
            if throttled:
                self.last_throttle_event = now
            events += throttled
            level = temp_level(self.temp_level, temp, c.temp_warn_c, c.temp_danger_c)
            events += temp_events(self.temp_level, level, temp)
            self.temp_level = level
            ws = wifi_state(self.wifi_state, wifi, c.wifi_weak_dbm)
            events += wifi_events(self.wifi_state, ws, wifi)
            self.wifi_state = ws
            if temp is not None:
                self.win_temps.append(temp)
            if live["cpu_pct"] is not None:
                self.win_cpu.append(live["cpu_pct"])
            self.live = live
        self._emit(events, now)

    def tick_checks(self):
        now = self.clock()
        results = self.checker(self.cfg.services)
        events = []
        with self.lock:
            for sid, res in results.items():
                prev = self.services[sid]
                new = update_service(prev, res, now)
                events += service_events(sid, prev, new, now)
                self.services[sid] = new
                w = self.win_services[sid]
                w[1] += 1
                if res.ok:
                    w[0] += 1
                if res.ms is not None:
                    w[2] += res.ms
                    w[3] += 1
        self._emit(events, now)

    def tick_weather(self):
        self.weather.refresh(self.clock())

    def tick_history(self):
        now = int(self.clock())
        with self.lock:
            live, temps, cpus = self.live, self.win_temps, self.win_cpu
            services = {sid: {"up_checks": w[0], "total_checks": w[1], "avg_ms": w[2] // w[3] if w[3] else None}
                        for sid, w in self.win_services.items() if w[1]}
            throttle = self.window_throttle
            self.window_throttle = 0
            self._reset_window()
        mem = live.get("mem_mb") or [None, None]
        disk = live.get("disk_gb") or [None, None]
        wifi, net, load = live.get("wifi") or {}, live.get("net") or {}, live.get("load") or [None]
        sample = {
            "cpu_temp": round(sum(temps) / len(temps), 1) if temps else None,
            "cpu_temp_max": max(temps) if temps else None,
            "outside_temp": self.weather.current(now),
            "cpu_pct": round(sum(cpus) / len(cpus), 1) if cpus else None,
            "load1": load[0],
            "mem_used_mb": mem[0], "mem_total_mb": mem[1],
            "disk_used_gb": disk[0], "disk_total_gb": disk[1],
            "wifi_dbm": wifi.get("dbm"), "wifi_quality": wifi.get("quality"),
            "rx_bps": net.get("rx_bps"), "tx_bps": net.get("tx_bps"),
            "throttle_delta": throttle,
        }
        try:
            self.store.write_sample(now, sample, services)
        except Exception:
            log.exception("history write failed")
            with self.lock:
                self.window_throttle += throttle  # keep today's count right
            return
        base = self.store.throttle_today(now, self.cfg.tz)
        ticker = self.store.ticker(now, self.cfg.tz)
        with self.lock:
            self.throttle_base, self.ticker = base, ticker

    def tick_prune(self):
        self.store.prune(int(self.clock()), self.cfg.retention_days)

    def snapshot(self):
        now = self.clock()
        with self.lock:
            live = dict(self.live)
            services = [{"id": sid, "up": st.up, "ms": st.ms, "status": st.status}
                        for sid, st in self.services.items()]
            throttle_today = self.throttle_base + self.window_throttle if self.throttle_readable else None
            ticker = dict(self.ticker)
        return {
            "ts": int(now),
            "cpu_temp": live.get("cpu_temp"),
            "outside_temp": self.weather.current(now),
            "throttle_today": throttle_today,
            "cpu_pct": live.get("cpu_pct"),
            "load": live.get("load"),
            "mem_mb": live.get("mem_mb"),
            "disk_gb": live.get("disk_gb"),
            "boot_time": live.get("boot_time"),
            "wifi": live.get("wifi"),
            "net": live.get("net"),
            "top": live.get("top"),
            "procs": live.get("procs"),
            "services": services,
            "ticker": ticker,
        }

    def run(self, stop):
        local = [(self.HOST_INTERVAL_S, self.tick_host, 0),
                 (self.cfg.history_interval_s, self.tick_history, self.cfg.history_interval_s),
                 (self.PRUNE_INTERVAL_S, self.tick_prune, 60)]
        network = [(self.cfg.check_interval_s, self.tick_checks, 0),
                   (self.WEATHER_INTERVAL_S, self.tick_weather, 0)]
        threads = [threading.Thread(target=_loop, args=(jobs, stop, self.clock), name=name, daemon=True)
                   for name, jobs in (("local", local), ("network", network))]
        for t in threads:
            t.start()
        return threads


def _loop(jobs, stop, clock):
    start = clock()
    due = [start + delay for _, _, delay in jobs]
    while not stop.is_set():
        now = clock()
        for i, (interval, fn, _) in enumerate(jobs):
            if now >= due[i]:
                due[i] = now + interval
                try:
                    fn()
                except Exception:
                    log.exception("%s failed", fn.__name__)
        stop.wait(0.5)
