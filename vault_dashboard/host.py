"""Pure readers for host metrics. Every reader returns None when its source is missing or unreadable.

Paths are rooted at configurable /proc and /sys roots so tests can use fake trees and the
container can read the host's /proc from a bind mount. Network files are read from PID 1's
namespace (`<proc>/1/net/...`): the container's own /proc/net only sees its virtual interface.
"""
import glob
import os


def _read(path):
    try:
        with open(path, encoding="ascii", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def _milli(text):
    try:
        return round(int(text.strip()) / 1000, 1)
    except (AttributeError, ValueError):
        return None


def read_cpu_temp(sys_root, zone="auto"):
    if zone != "auto":
        return _milli(_read(f"{sys_root}/class/thermal/{zone}/temp"))
    for zdir in sorted(glob.glob(f"{sys_root}/class/thermal/thermal_zone*")):
        if (_read(f"{zdir}/type") or "").strip() == "x86_pkg_temp":
            temp = _milli(_read(f"{zdir}/temp"))
            if temp is not None:
                return temp
    for hdir in sorted(glob.glob(f"{sys_root}/class/hwmon/hwmon*")):
        if (_read(f"{hdir}/name") or "").strip() == "coretemp":
            temp = _milli(_read(f"{hdir}/temp1_input"))
            if temp is not None:
                return temp
    return None


def read_throttle_count(sys_root):
    counts = []
    for path in glob.glob(f"{sys_root}/devices/system/cpu/cpu*/thermal_throttle/package_throttle_count"):
        try:
            counts.append(int((_read(path) or "").strip()))
        except ValueError:
            pass
    return max(counts) if counts else None


def read_cpu_times(proc_root):
    text = _read(f"{proc_root}/stat")
    if not text:
        return None
    fields = text.splitlines()[0].split()
    if len(fields) < 9 or fields[0] != "cpu":
        return None
    try:
        user, nice, system, idle, iowait, irq, softirq, steal = (int(v) for v in fields[1:9])
    except ValueError:
        return None
    total = user + nice + system + idle + iowait + irq + softirq + steal
    return (total - idle - iowait, total)


def cpu_percent(prev, cur):
    if prev is None or cur is None:
        return None
    busy, total = cur[0] - prev[0], cur[1] - prev[1]
    if total <= 0:
        return None
    return round(max(0.0, min(100.0, 100.0 * busy / total)), 1)


def read_loadavg(proc_root):
    text = _read(f"{proc_root}/loadavg")
    try:
        values = [float(v) for v in text.split()[:3]]
    except (AttributeError, ValueError):
        return None
    return values if len(values) == 3 else None


def read_meminfo(proc_root):
    text = _read(f"{proc_root}/meminfo")
    if not text:
        return None
    kb = {}
    for line in text.splitlines():
        key, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            kb[key.strip()] = int(parts[0])
    if "MemTotal" not in kb or "MemAvailable" not in kb:
        return None
    return ((kb["MemTotal"] - kb["MemAvailable"]) // 1024, kb["MemTotal"] // 1024)


def read_disk(path):
    try:
        st = os.statvfs(path)
    except OSError:
        return None
    gb = 1024 ** 3
    total = st.f_blocks * st.f_frsize
    used = (st.f_blocks - st.f_bfree) * st.f_frsize
    return (round(used / gb, 1), round(total / gb, 1))


def read_boot_time(proc_root, now):
    text = _read(f"{proc_root}/uptime")
    try:
        return int(now - float(text.split()[0]))
    except (AttributeError, IndexError, ValueError):
        return None


def _iface_fields(text, iface):
    for line in (text or "").splitlines()[2:]:
        name, sep, rest = line.partition(":")
        if sep and name.strip() == iface:
            return rest.split()
    return None


def read_wifi(proc_root, iface):
    parts = _iface_fields(_read(f"{proc_root}/1/net/wireless"), iface)
    if parts is None:
        return None
    try:
        link = float(parts[1].rstrip("."))
        level = float(parts[2].rstrip("."))
    except (IndexError, ValueError):
        return None
    if level > 0:  # some drivers report dBm as an unsigned byte
        level -= 256
    return {"dbm": int(level), "quality": int(min(100, round(link / 70 * 100)))}


def read_net_bytes(proc_root, iface):
    parts = _iface_fields(_read(f"{proc_root}/1/net/dev"), iface)
    if parts is None:
        return None
    try:
        return (int(parts[0]), int(parts[8]))
    except (IndexError, ValueError):
        return None


# ---------- static system identity (the neofetch panel) ----------

_CPU_NOISE = {"Intel", "AMD", "Core", "CPU", "Processor"}
_DMI_JUNK = ("o.e.m", "not specified", "default string", "system version", "none")


def _cpu_name(cpuinfo):
    models = [line.split(":", 1)[1].strip() for line in cpuinfo.splitlines() if line.startswith("model name")]
    if not models:
        return None
    words = models[0].replace("(R)", "").replace("(TM)", "").split()
    name = " ".join(w for w in words if w not in _CPU_NOISE)
    model, at, speed = name.partition(" @ ")
    return f"{model} ({len(models)})" + (f" @ {speed}" if at else "")


def _host_model(sys_root):
    for field in ("product_version", "product_name"):
        value = (_read(f"{sys_root}/class/dmi/id/{field}") or "").strip()
        if len(value) > 3 and not value.replace(".", "").isdigit() and not any(j in value.lower() for j in _DMI_JUNK):
            return value
    return None


def _os_name(os_release):
    for line in (_read(os_release) or "").splitlines():
        key, _, value = line.partition("=")
        if key == "PRETTY_NAME":
            return value.strip().strip('"').replace(" GNU/Linux", "") or None
    return None


def read_system_info(proc_root, sys_root, os_release):
    kernel = (_read(f"{proc_root}/sys/kernel/osrelease") or "").strip() or None
    return {
        "os": _os_name(os_release),
        "host": _host_model(sys_root),
        "kernel": kernel,
        "cpu": _cpu_name(_read(f"{proc_root}/cpuinfo") or ""),
    }


# ---------- processes (the TOP.EXE window) ----------

def read_processes(proc_root):
    """{pid: (name, cpu_ticks, rss_pages)} for every readable process; None if /proc is unreadable."""
    try:
        entries = os.listdir(proc_root)
    except OSError:
        return None
    procs = {}
    for entry in entries:
        if not entry.isdigit():
            continue
        text = _read(f"{proc_root}/{entry}/stat") or ""  # processes vanish between listdir and read
        open_, close = text.find("("), text.rfind(")")
        if open_ < 0 or close < open_:
            continue
        fields = text[close + 1:].split()
        try:
            procs[int(entry)] = (text[open_ + 1:close], int(fields[11]) + int(fields[12]), int(fields[21]))
        except (IndexError, ValueError):
            continue
    return procs


def top_processes(prev, cur, total_delta, mem_total_kb, page_kb, n=8):
    """Group processes by name; CPU % is the share of the whole machine since `prev` (Task Manager style)."""
    groups = {}
    for pid, (name, ticks, rss) in cur.items():
        g = groups.setdefault(name, [0, 0, 0])  # count, cpu ticks, rss pages
        g[0] += 1
        if prev and total_delta and pid in prev and prev[pid][0] == name:
            g[1] += max(0, ticks - prev[pid][1])
        g[2] += rss
    rows = [{"name": name, "count": c,
             "cpu": round(100 * t / total_delta, 1) if total_delta else 0.0,
             "mem": round(100 * r * page_kb / mem_total_kb, 1) if mem_total_kb else 0.0}
            for name, (c, t, r) in groups.items()]
    rows.sort(key=lambda r: (-r["cpu"], -r["mem"], r["name"]))
    return rows[:n]
