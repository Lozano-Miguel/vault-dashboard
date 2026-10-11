import unittest

from tests.fixtures import (
    CPUINFO, OS_RELEASE, PROC_FILES, PROC_STAT_2, PROCESS_FILES_1, PROCESS_FILES_2, SYS_FILES,
)
from tests.helpers import make_tree
from vault_dashboard import host


class HostReadersTest(unittest.TestCase):
    def setUp(self):
        self.proc = make_tree(self, PROC_FILES)
        self.sys = make_tree(self, SYS_FILES)

    def test_cpu_temp_prefers_x86_pkg_temp(self):
        self.assertEqual(host.read_cpu_temp(self.sys), 61.0)

    def test_cpu_temp_explicit_zone(self):
        self.assertEqual(host.read_cpu_temp(self.sys, "thermal_zone0"), 27.8)

    def test_cpu_temp_hwmon_fallback(self):
        sys_root = make_tree(self, {"class/hwmon/hwmon2/name": "coretemp\n", "class/hwmon/hwmon2/temp1_input": "55500\n"})
        self.assertEqual(host.read_cpu_temp(sys_root), 55.5)

    def test_throttle_count_is_max_across_cpus(self):
        self.assertEqual(host.read_throttle_count(self.sys), 5)

    def test_cpu_percent_from_two_samples(self):
        first = host.read_cpu_times(self.proc)
        second_root = make_tree(self, {"stat": PROC_STAT_2})
        second = host.read_cpu_times(second_root)
        self.assertEqual(first, (200, 1000))
        self.assertEqual(host.cpu_percent(first, second), 50.0)
        self.assertIsNone(host.cpu_percent(None, second))
        self.assertIsNone(host.cpu_percent(second, second))  # no time passed

    def test_loadavg(self):
        self.assertEqual(host.read_loadavg(self.proc), [0.42, 0.51, 0.38])

    def test_meminfo_uses_available(self):
        self.assertEqual(host.read_meminfo(self.proc), (6000, 8000))

    def test_disk_reports_used_and_total(self):
        used, total = host.read_disk(self.proc)
        self.assertGreater(total, 0)
        self.assertLessEqual(used, total)

    def test_boot_time(self):
        self.assertEqual(host.read_boot_time(self.proc, now=2000.5), 1000)

    def test_wifi(self):
        self.assertEqual(host.read_wifi(self.proc, "wlp2s0"), {"dbm": -58, "quality": 71})
        self.assertIsNone(host.read_wifi(self.proc, "wlan0"))

    def test_wifi_unsigned_level(self):
        line = "wlp2s0: 0000   70.  196.  0        0      0      0      0      0        0\n"
        proc = make_tree(self, {"1/net/wireless": "h1\nh2\n" + line})
        self.assertEqual(host.read_wifi(proc, "wlp2s0"), {"dbm": -60, "quality": 100})

    def test_net_bytes(self):
        self.assertEqual(host.read_net_bytes(self.proc, "wlp2s0"), (1000000, 200000))
        self.assertIsNone(host.read_net_bytes(self.proc, "eth0"))

    def test_empty_tree_returns_none(self):
        empty = make_tree(self, {})
        self.assertIsNone(host.read_cpu_temp(empty))
        self.assertIsNone(host.read_throttle_count(empty))
        self.assertIsNone(host.read_cpu_times(empty))
        self.assertIsNone(host.read_loadavg(empty))
        self.assertIsNone(host.read_meminfo(empty))
        self.assertIsNone(host.read_disk(empty + "/missing"))
        self.assertIsNone(host.read_boot_time(empty, now=1.0))
        self.assertIsNone(host.read_wifi(empty, "wlp2s0"))
        self.assertIsNone(host.read_net_bytes(empty, "wlp2s0"))

    def test_garbage_content_returns_none(self):
        junk = make_tree(self, {"stat": "nonsense\n", "meminfo": "MemTotal: lots\n", "loadavg": "a b c\n", "uptime": "?\n"})
        self.assertIsNone(host.read_cpu_times(junk))
        self.assertIsNone(host.read_meminfo(junk))
        self.assertIsNone(host.read_loadavg(junk))
        self.assertIsNone(host.read_boot_time(junk, now=1.0))


class SystemInfoTest(unittest.TestCase):
    def test_reads_os_host_kernel_cpu(self):
        proc = make_tree(self, {"cpuinfo": CPUINFO, "sys/kernel/osrelease": "6.1.0-28-amd64\n"})
        sys_root = make_tree(self, {"class/dmi/id/product_version": "ThinkCentre M710q\n",
                                    "class/dmi/id/product_name": "10MQS0Q400\n"})
        etc = make_tree(self, {"os-release": OS_RELEASE})
        self.assertEqual(host.read_system_info(proc, sys_root, etc + "/os-release"), {
            "os": "Debian 12 (bookworm)", "host": "ThinkCentre M710q",
            "kernel": "6.1.0-28-amd64", "cpu": "i3-7100 (4) @ 3.90GHz"})

    def test_junk_product_version_falls_back_to_product_name(self):
        sys_root = make_tree(self, {"class/dmi/id/product_version": "To be filled by O.E.M.\n",
                                    "class/dmi/id/product_name": "OptiPlex 3050\n"})
        self.assertEqual(host.read_system_info("/nonexistent", sys_root, "/nonexistent")["host"], "OptiPlex 3050")

    def test_amd_cpu_name(self):
        cpuinfo = "processor\t: 0\nmodel name\t: AMD Ryzen 5 3600 6-Core Processor\n\n" * 1
        proc = make_tree(self, {"cpuinfo": cpuinfo})
        self.assertEqual(host.read_system_info(proc, "/nonexistent", "/nonexistent")["cpu"], "Ryzen 5 3600 6-Core (1)")

    def test_everything_missing_is_none(self):
        self.assertEqual(host.read_system_info("/nonexistent", "/nonexistent", "/nonexistent"),
                         {"os": None, "host": None, "kernel": None, "cpu": None})


class ProcessesTest(unittest.TestCase):
    def test_read_processes_parses_names_with_spaces_and_skips_non_pids(self):
        procs = host.read_processes(make_tree(self, PROCESS_FILES_1))
        self.assertEqual(procs, {100: ("node", 1500, 25600), 101: ("postgres", 400, 5120),
                                 102: ("postgres", 300, 5120), 103: ("tmux: server", 15, 256)})

    def test_name_with_parenthesis(self):
        procs = host.read_processes(make_tree(self, {"7/stat": "7 (a) b) S 1 7 7 0 -1 0 0 0 0 0 9 1 0 0 20 0 1 0 1 1 4 0\n"}))
        self.assertEqual(procs, {7: ("a) b", 10, 4)})

    def test_vanished_or_garbled_processes_are_skipped(self):
        procs = host.read_processes(make_tree(self, {"5/stat": "", "6/stat": "6 (x) S 1\n", "8/stat": "garbage"}))
        self.assertEqual(procs, {})
        self.assertIsNone(host.read_processes("/nonexistent"))

    def test_top_processes_groups_by_name_and_ranks_by_cpu(self):
        prev = host.read_processes(make_tree(self, PROCESS_FILES_1))
        cur = host.read_processes(make_tree(self, PROCESS_FILES_2))
        top = host.top_processes(prev, cur, total_delta=800, mem_total_kb=8_000_000, page_kb=4)
        self.assertEqual(top, [
            {"name": "node", "count": 1, "cpu": 25.0, "mem": 1.3},
            {"name": "postgres", "count": 1, "cpu": 5.0, "mem": 0.3},
            {"name": "python3", "count": 1, "cpu": 0.0, "mem": 0.1},
            {"name": "tmux: server", "count": 1, "cpu": 0.0, "mem": 0.0},
        ])

    def test_top_processes_first_sample_ranks_by_memory_and_limits(self):
        cur = host.read_processes(make_tree(self, PROCESS_FILES_1))
        top = host.top_processes(None, cur, total_delta=None, mem_total_kb=8_000_000, page_kb=4, n=2)
        self.assertEqual(top, [{"name": "node", "count": 1, "cpu": 0.0, "mem": 1.3},
                               {"name": "postgres", "count": 2, "cpu": 0.0, "mem": 0.5}])


if __name__ == "__main__":
    unittest.main()
