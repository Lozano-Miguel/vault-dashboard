import os
import tempfile
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from vault_dashboard.store import SAMPLE_FIELDS, Store, local_midnight

TZ = "Europe/Lisbon"
NOON = int(datetime(2026, 7, 15, 12, 0, tzinfo=ZoneInfo(TZ)).timestamp())
MIDNIGHT = int(datetime(2026, 7, 15, 0, 0, tzinfo=ZoneInfo(TZ)).timestamp())


def sample(**over):
    s = dict.fromkeys(SAMPLE_FIELDS)
    s.update({"throttle_delta": 0, **over})
    return s


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.store = Store(":memory:")
        self.addCleanup(self.store.close)

    def test_events_initial_and_after(self):
        ids = [self.store.add_event(NOON + i, "temp", "warn", f"e{i}") for i in range(20)]
        initial = self.store.events_after(None)
        self.assertEqual([e["text"] for e in initial], [f"e{i}" for i in range(8, 20)])
        newer = self.store.events_after(ids[17])
        self.assertEqual([e["text"] for e in newer], ["e18", "e19"])
        self.assertEqual(set(newer[0]), {"id", "ts", "level", "text"})

    def test_events_after_beyond_last_id_is_empty(self):
        last = self.store.add_event(NOON, "boot", "dim", "boot")
        self.assertEqual(self.store.events_after(last + 100), [])

    def test_meta_roundtrip(self):
        self.assertIsNone(self.store.get_meta("boot_time"))
        self.store.set_meta("boot_time", "123")
        self.store.set_meta("boot_time", "456")
        self.assertEqual(self.store.get_meta("boot_time"), "456")

    def test_ticker_and_throttle_today(self):
        self.store.write_sample(MIDNIGHT - 300, sample(cpu_temp_max=90.0, throttle_delta=9), {})  # yesterday
        self.store.write_sample(NOON - 600, sample(cpu_temp_max=66.4, throttle_delta=1),
                                {"app": {"up_checks": 20, "total_checks": 20, "avg_ms": 40}})
        self.store.write_sample(NOON - 300, sample(cpu_temp_max=68.2, throttle_delta=2),
                                {"app": {"up_checks": 19, "total_checks": 20, "avg_ms": 45}})
        self.store.add_event(NOON - 200, "service_down", "alarm", "app DOWN")
        self.store.add_event(NOON - 100, "service_up", "normal", "app back up")
        t = self.store.ticker(NOON, TZ)
        self.assertEqual(t["hottest_today"], {"c": 68, "at": NOON - 300})
        self.assertEqual(t["availability_7d"], 97.5)
        self.assertEqual(t["last_outage"], NOON - 200)
        self.assertEqual(t["recording_since"], MIDNIGHT - 300)
        self.assertEqual(self.store.throttle_today(NOON, TZ), 3)

    def test_ticker_empty(self):
        self.assertEqual(self.store.ticker(NOON, TZ), {
            "hottest_today": None, "availability_7d": None, "last_outage": None, "recording_since": None})

    def test_prune(self):
        old, new = NOON - 200 * 86400, NOON - 3600
        for ts in (old, new):
            self.store.write_sample(ts, sample(), {"app": {"up_checks": 1, "total_checks": 1, "avg_ms": 1}})
            self.store.add_event(ts, "boot", "dim", "boot")
        self.store.prune(NOON, 183)
        self.assertEqual(self.store.ticker(NOON, TZ)["recording_since"], new)
        self.assertEqual([e["ts"] for e in self.store.events_after(None)], [new])

    def test_history_since(self):
        self.store.write_sample(NOON - 7200, sample(cpu_temp=50.0, cpu_temp_max=51.0, outside_temp=20.0),
                                {"app": {"up_checks": 20, "total_checks": 20, "avg_ms": 40}})  # too old
        self.store.write_sample(NOON - 600, sample(cpu_temp=60.0, cpu_temp_max=63.5, outside_temp=24.0),
                                {"app": {"up_checks": 20, "total_checks": 20, "avg_ms": 40},
                                 "db": {"up_checks": 18, "total_checks": 20, "avg_ms": 3}})
        self.store.write_sample(NOON - 300, sample(cpu_temp=61.0, cpu_temp_max=62.0),
                                {"app": {"up_checks": 0, "total_checks": 20, "avg_ms": None}})
        h = self.store.history(NOON - 3600)
        self.assertEqual(h["samples"], [[NOON - 600, 60.0, 63.5, 24.0], [NOON - 300, 61.0, 62.0, None]])
        self.assertEqual(h["services"], {"app": [[NOON - 600, 20, 20], [NOON - 300, 0, 20]],
                                         "db": [[NOON - 600, 18, 20]]})

    def test_local_midnight_on_dst_day(self):
        # 2026-10-25: Lisbon falls back from WEST (+1) to WET (+0) at 02:00
        tz = ZoneInfo(TZ)
        noon = datetime(2026, 10, 25, 12, 0, tzinfo=tz).timestamp()
        self.assertEqual(local_midnight(noon, TZ), int(datetime(2026, 10, 25, 0, 0, tzinfo=tz).timestamp()))
        self.assertEqual(datetime.fromtimestamp(local_midnight(noon, TZ), tz).hour, 0)


class StoreFileTest(unittest.TestCase):
    def test_ids_continue_after_reopen(self):
        path = os.path.join(tempfile.mkdtemp(prefix="vault-db-"), "vault.db")
        s1 = Store(path)
        first = s1.add_event(NOON, "boot", "dim", "boot")
        s1.close()
        s2 = Store(path)
        self.addCleanup(s2.close)
        self.assertGreater(s2.add_event(NOON + 1, "boot", "dim", "boot"), first)
        self.assertEqual(len(s2.events_after(first)), 1)


if __name__ == "__main__":
    unittest.main()
