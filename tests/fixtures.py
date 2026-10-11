"""Realistic contents of the /proc and /sys files the dashboard reads."""

PROC_STAT_1 = "cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 50 0 50 350 50 0 0 0 0 0\n"
# +50 user, +50 system, +50 idle, +50 iowait => busy +100 of total +200 => 50%
PROC_STAT_2 = "cpu  150 0 150 750 150 0 0 0 0 0\ncpu0 75 0 75 375 75 0 0 0 0 0\n"

WIRELESS = (
    "Inter-| sta-|   Quality        |   Discarded packets               | Missed | WE\n"
    " face | tus | link level noise |  nwid  crypt   frag  retry   misc | beacon | 22\n"
    "wlp2s0: 0000   50.  -58.  -256        0      0      0      0      0        0\n"
)

NETDEV = (
    "Inter-|   Receive                                                |  Transmit\n"
    " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n"
    "    lo:     500       5    0    0    0     0          0         0      500       5    0    0    0     0       0          0\n"
    "wlp2s0: 1000000     900    0    0    0     0          0         0   200000     800    0    0    0     0       0          0\n"
)

PROC_FILES = {
    "stat": PROC_STAT_1,
    "meminfo": "MemTotal:        8192000 kB\nMemFree:         1000000 kB\nMemAvailable:    2048000 kB\n",
    "loadavg": "0.42 0.51 0.38 1/234 5678\n",
    "uptime": "1000.50 3000.00\n",
    "1/net/wireless": WIRELESS,
    "1/net/dev": NETDEV,
}

SYS_FILES = {
    "class/thermal/thermal_zone0/type": "acpitz\n",
    "class/thermal/thermal_zone0/temp": "27800\n",
    "class/thermal/thermal_zone1/type": "x86_pkg_temp\n",
    "class/thermal/thermal_zone1/temp": "61000\n",
    "devices/system/cpu/cpu0/thermal_throttle/package_throttle_count": "3\n",
    "devices/system/cpu/cpu1/thermal_throttle/package_throttle_count": "5\n",
}

CPUINFO = (
    "processor\t: 0\nmodel name\t: Intel(R) Core(TM) i3-7100 CPU @ 3.90GHz\ncpu cores\t: 2\n\n"
    "processor\t: 1\nmodel name\t: Intel(R) Core(TM) i3-7100 CPU @ 3.90GHz\ncpu cores\t: 2\n\n"
    "processor\t: 2\nmodel name\t: Intel(R) Core(TM) i3-7100 CPU @ 3.90GHz\ncpu cores\t: 2\n\n"
    "processor\t: 3\nmodel name\t: Intel(R) Core(TM) i3-7100 CPU @ 3.90GHz\ncpu cores\t: 2\n\n"
)

OS_RELEASE = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\n'


def stat_line(pid, name, utime, stime, rss):
    """A /proc/<pid>/stat line with the fields the dashboard reads; the rest are realistic filler."""
    return (f"{pid} ({name}) S 1 {pid} {pid} 0 -1 4194560 100 0 0 0 {utime} {stime} 0 0 20 0 1 0 "
            f"1000 123456789 {rss} 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 1 0 0 0 0 0\n")


PROCESS_FILES_1 = {
    "100/stat": stat_line(100, "node", 1000, 500, 25600),      # 100 MB
    "101/stat": stat_line(101, "postgres", 300, 100, 5120),     # 20 MB
    "102/stat": stat_line(102, "postgres", 200, 100, 5120),
    "103/stat": stat_line(103, "tmux: server", 10, 5, 256),
    "self/stat": stat_line(999, "ignored", 0, 0, 0),
    "1/net/dev": "not a process dir with stat\n",
}

# 2 s later on a 4-thread machine: 800 total jiffies passed; node used 200, postgres 40+40, 102 exited
PROCESS_FILES_2 = {
    "100/stat": stat_line(100, "node", 1150, 550, 25600),
    "101/stat": stat_line(101, "postgres", 330, 110, 5120),
    "103/stat": stat_line(103, "tmux: server", 10, 5, 256),
    "104/stat": stat_line(104, "python3", 50, 0, 2560),         # new: no previous sample
}
