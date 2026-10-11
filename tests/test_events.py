import unittest

from vault_dashboard.checks import CheckResult
from vault_dashboard.events import (
    boot_events, duration, initial_service_state, service_events, temp_events, temp_level,
    throttle_events, update_service, wifi_events, wifi_state,
)

OK = CheckResult(True, 42, "200")
FAIL_502 = CheckResult(False, None, "502")
FAIL_TIMEOUT = CheckResult(False, None, "timeout")


def run(results, start=None, t0=0.0):
    """Feed results one per 15 s; return (final state, all event texts)."""
    state, texts = start or initial_service_state(t0), []
    for i, r in enumerate(results, 1):
        new = update_service(state, r, t0 + 15 * i)
        texts += [e.text for e in service_events("app", state, new, t0 + 15 * i)]
        state = new
    return state, texts


class ServiceEventsTest(unittest.TestCase):
    def test_first_success_is_quiet(self):
        state, texts = run([OK])
        self.assertTrue(state.up)
        self.assertEqual(texts, [])

    def test_one_failure_is_debounced(self):
        state, texts = run([OK, FAIL_502])
        self.assertTrue(state.up)
        self.assertEqual(texts, [])

    def test_two_failures_go_down_with_http_reason(self):
        state, texts = run([OK, FAIL_502, FAIL_502])
        self.assertFalse(state.up)
        self.assertEqual(texts, ["app 502 bad gateway"])

    def test_timeout_text(self):
        _, texts = run([OK, FAIL_TIMEOUT, FAIL_TIMEOUT])
        self.assertEqual(texts, ["app DOWN · no answer"])

    def test_down_at_startup_reports_once(self):
        _, texts = run([FAIL_502, FAIL_502, FAIL_502])
        self.assertEqual(texts, ["app 502 bad gateway"])

    def test_recovery_reports_duration(self):
        # down confirmed at t=45, back at t=285 => 4m
        _, texts = run([OK, FAIL_502, FAIL_502] + [FAIL_502] * 15 + [OK])
        self.assertEqual(texts[-1], "app back up · down 4m")

    def test_duration_format(self):
        self.assertEqual(duration(42), "42s")
        self.assertEqual(duration(240), "4m")
        self.assertEqual(duration(3 * 3600 + 120), "3h 2m")
        self.assertEqual(duration(2 * 86400 + 3600), "2d 1h")


class TempEventsTest(unittest.TestCase):
    def walk(self, temps):
        level, texts = "normal", []
        for t in temps:
            new = temp_level(level, t, 70, 80)
            texts += [(e.level, e.text) for e in temp_events(level, new, t)]
            level = new
        return level, texts

    def test_rising_through_both_thresholds(self):
        _, texts = self.walk([60, 71, 75, 80.4])
        self.assertEqual(texts, [("warn", "temp 71°C · warm"), ("alarm", "temp 80°C · DANGER")])

    def test_hysteresis_prevents_spam(self):
        _, texts = self.walk([71, 69, 71, 68, 70])
        self.assertEqual(texts, [("warn", "temp 71°C · warm")])

    def test_cooling_below_warn_minus_band(self):
        level, texts = self.walk([82, 76, 66])
        self.assertEqual(level, "normal")
        self.assertEqual(texts[-1], ("normal", "temp 66°C · cooling"))

    def test_none_keeps_level(self):
        self.assertEqual(temp_level("warn", None, 70, 80), "warn")
        self.assertEqual(temp_events("warn", "warn", None), [])


class OtherEventsTest(unittest.TestCase):
    def test_throttle(self):
        self.assertEqual([e.text for e in throttle_events(1, 3)], ["throttle #3"])
        self.assertEqual(throttle_events(3, 3), [])

    def test_throttle_is_rate_limited_during_sustained_throttling(self):
        self.assertEqual(throttle_events(3, 9, now=1300, last_emit=1000), [])  # 5 min after the last one
        self.assertEqual([e.text for e in throttle_events(3, 9, now=1600, last_emit=1000)], ["throttle #9"])
        self.assertEqual([e.text for e in throttle_events(3, 9, now=1300, last_emit=None)], ["throttle #9"])

    def test_wifi_transitions(self):
        weak, good = {"dbm": -80, "quality": 30}, {"dbm": -58, "quality": 72}
        self.assertEqual(wifi_state(None, good, -75), "ok")
        self.assertEqual(wifi_events(None, "lost", None), [])  # first observation is quiet
        self.assertEqual([e.text for e in wifi_events("ok", "weak", weak)], ["wifi weak -80dBm"])
        self.assertEqual([e.text for e in wifi_events("ok", "lost", None)], ["wifi lost"])
        self.assertEqual([e.text for e in wifi_events("lost", "ok", good)], ["wifi back -58dBm"])
        self.assertEqual(wifi_events("weak", "ok", good), [])

    def test_wifi_weak_hysteresis(self):
        self.assertEqual(wifi_state("weak", {"dbm": -74, "quality": 40}, -75), "weak")
        self.assertEqual(wifi_state("weak", {"dbm": -71, "quality": 45}, -75), "ok")
        self.assertEqual(wifi_state("ok", None, -75), "lost")

    def test_boot(self):
        self.assertEqual([e.text for e in boot_events(1000, 90000)], ["boot"])
        self.assertEqual(boot_events(1000, 1020), [])  # uptime rounding jitter
        self.assertEqual(boot_events(None, 1000), [])


if __name__ == "__main__":
    unittest.main()
