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
