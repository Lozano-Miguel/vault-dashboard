import unittest

from tests.fixtures import PROC_FILES, PROC_STAT_2, SYS_FILES
from tests.helpers import make_tree, write
from vault_dashboard.checks import CheckResult
from vault_dashboard.config import Config, Service
from vault_dashboard.sampler import Sampler
from vault_dashboard.store import Store
from vault_dashboard.weather import Weather

OK = CheckResult(True, 40, "200")
DOWN = CheckResult(False, None, "502")


class Clock:
    def __init__(self, t=1_784_000_000.0):
        self.t = t

    def __call__(self):
        return self.t


class SamplerTest(unittest.TestCase):
    def setUp(self):
        self.proc = make_tree(self, PROC_FILES)
        self.sys = make_tree(self, SYS_FILES)
        self.cfg = Config(services=(Service("app", "http://app/"), Service("app.example", "https://x/", "app")),
                          host_proc=self.proc, host_sys=self.sys, disk_path=self.proc,
                          wifi_iface="wlp2s0", tz="Europe/Lisbon")
        self.store = Store(":memory:")
        self.addCleanup(self.store.close)
        self.clock = Clock()
        self.results = {"app": OK, "app.example": OK}
        self.sampler = Sampler(self.cfg, self.store, checker=lambda services: dict(self.results),
                               weather=Weather(1, 2, fetch=lambda lat, lon: 27.0), clock=self.clock)
        self.sampler.start()

    def texts(self):
        return [e["text"] for e in self.store.events_after(0)]

    def test_snapshot_shape_before_any_tick(self):
        snap = self.sampler.snapshot()
        self.assertEqual(set(snap), {"ts", "cpu_temp", "outside_temp", "throttle_today", "cpu_pct", "load",
                                     "mem_mb", "disk_gb", "boot_time", "wifi", "net", "services", "ticker"})
        self.assertEqual(snap["services"], [{"id": "app", "up": None, "ms": None, "status": ""},
                                            {"id": "app.example", "up": None, "ms": None, "status": ""}])

    def test_host_tick_fills_live_values(self):
        self.sampler.tick_host()
        write(self.proc, "stat", PROC_STAT_2)
        write(self.proc, "1/net/dev", PROC_FILES["1/net/dev"].replace("1000000", "1300000"))
        self.clock.t += 3
        self.sampler.tick_host()
        snap = self.sampler.snapshot()
        self.assertEqual(snap["cpu_temp"], 61.0)
        self.assertEqual(snap["cpu_pct"], 50.0)
        self.assertEqual(snap["load"], [0.42, 0.51, 0.38])
        self.assertEqual(snap["mem_mb"], [6000, 8000])
        self.assertEqual(snap["wifi"], {"dbm": -58, "quality": 71})
        self.assertEqual(snap["net"], {"rx_bps": 100000, "tx_bps": 0})
        self.assertEqual(snap["boot_time"], int(self.clock.t - 1000.5))

    def test_throttle_today_is_null_when_counter_unreadable(self):
        self.assertIsNone(self.sampler.snapshot()["throttle_today"])  # before any reading
        sys_root = make_tree(self, {k: v for k, v in SYS_FILES.items() if "thermal_throttle" not in k})
        sampler = Sampler(Config(services=(), host_proc=self.proc, host_sys=sys_root, disk_path=self.proc),
                          self.store, checker=lambda s: {}, clock=self.clock)
        sampler.tick_host()
        self.assertIsNone(sampler.snapshot()["throttle_today"])
        self.sampler.tick_host()
        self.assertEqual(self.sampler.snapshot()["throttle_today"], 0)

    def test_temperature_crossing_emits_event(self):
        self.sampler.tick_host()
        write(self.sys, "class/thermal/thermal_zone1/temp", "81000\n")
        self.sampler.tick_host()
        self.assertEqual(self.texts()[-1], "temp 81°C · DANGER")

    def test_throttle_counting_and_reset(self):
        self.sampler.tick_host()  # raw 5 is the baseline, not new throttling
        write(self.sys, "devices/system/cpu/cpu1/thermal_throttle/package_throttle_count", "7\n")
        self.sampler.tick_host()
        self.assertEqual(self.sampler.snapshot()["throttle_today"], 2)
        for path in ("cpu0", "cpu1"):  # reboot: counters restart
            write(self.sys, f"devices/system/cpu/{path}/thermal_throttle/package_throttle_count", "1\n")
        self.sampler.tick_host()
        self.assertEqual(self.sampler.snapshot()["throttle_today"], 3)
        write(self.sys, "devices/system/cpu/cpu1/thermal_throttle/package_throttle_count", "4\n")
        self.clock.t += 600
        self.sampler.tick_host()
        self.assertEqual(self.sampler.snapshot()["throttle_today"], 6)
        # the tick 3 s after #2 is counted but not announced; the next one after 10 min is
        self.assertEqual([t for t in self.texts() if t.startswith("throttle")], ["throttle #2", "throttle #6"])

    def test_checks_debounce_and_events(self):
        self.sampler.tick_checks()
        self.results["app.example"] = DOWN
        self.sampler.tick_checks()
        self.assertTrue(self.sampler.snapshot()["services"][1]["up"])
        self.sampler.tick_checks()
        self.assertEqual(self.sampler.snapshot()["services"][1],
                         {"id": "app.example", "up": False, "ms": None, "status": "502"})
        self.assertEqual(self.texts(), ["app.example 502 bad gateway"])

    def test_history_writes_aggregates_and_resets_window(self):
        self.sampler.tick_host()
        write(self.sys, "class/thermal/thermal_zone1/temp", "65000\n")
        self.sampler.tick_host()
        self.sampler.tick_checks()
        self.results["app"] = DOWN
        self.sampler.tick_checks()
        self.sampler.tick_weather()
        self.clock.t += 300
        self.sampler.tick_history()
        ts = int(self.clock.t)
        row = self.store.db.execute(
            "SELECT cpu_temp, cpu_temp_max, outside_temp, mem_used_mb, wifi_dbm FROM samples WHERE ts = ?",
            (ts,)).fetchone()
        self.assertEqual(row, (63.0, 65.0, 27.0, 6000, -58))
        svc = self.store.db.execute(
            "SELECT service_id, up_checks, total_checks, avg_ms FROM service_samples WHERE ts = ? ORDER BY service_id",
            (ts,)).fetchall()
        self.assertEqual(svc, [("app", 1, 2, 40), ("app.example", 2, 2, 40)])
        self.assertEqual(self.sampler.snapshot()["ticker"]["recording_since"], ts)
        self.clock.t += 300
        self.sampler.tick_history()  # empty window still records a row (vault was up)
        self.assertIsNone(self.store.db.execute(
            "SELECT cpu_temp FROM samples WHERE ts = ?", (int(self.clock.t),)).fetchone()[0])

    def test_boot_event_when_boot_time_changes(self):
        self.store.set_meta("boot_time", "1000")
        Sampler(self.cfg, self.store, checker=lambda s: {}, clock=self.clock).start()
        self.assertIn("boot", self.texts())
        self.assertEqual(self.store.get_meta("boot_time"), str(int(self.clock.t - 1000.5)))


if __name__ == "__main__":
    unittest.main()
