import io
import json
import unittest

from vault_dashboard.weather import STALE_AFTER_S, Weather, fetch_outside_temp


def opener_returning(body):
    def opener(url, timeout):
        opener.url = url
        return io.BytesIO(body.encode())
    return opener


class WeatherTest(unittest.TestCase):
    def test_fetch_parses_current_temperature(self):
        op = opener_returning(json.dumps({"current": {"temperature_2m": 27.3}}))
        self.assertEqual(fetch_outside_temp(38.7, -9.1, opener=op), 27.3)
        self.assertIn("latitude=38.7", op.url)
        self.assertIn("current=temperature_2m", op.url)

    def test_fetch_failures_return_none(self):
        def broken(url, timeout):
            raise OSError("network down")
        self.assertIsNone(fetch_outside_temp(1, 2, opener=broken))
        self.assertIsNone(fetch_outside_temp(1, 2, opener=opener_returning("{bad")))
        self.assertIsNone(fetch_outside_temp(1, 2, opener=opener_returning('{"current": {}}')))

    def test_disabled_without_coordinates(self):
        calls = []
        w = Weather(None, None, fetch=lambda *a: calls.append(a) or 20.0)
        w.refresh(0)
        self.assertFalse(w.enabled)
        self.assertEqual(calls, [])
        self.assertIsNone(w.current(0))

    def test_keeps_last_value_until_stale(self):
        values = iter([25.0, None])
        w = Weather(1, 2, fetch=lambda lat, lon: next(values))
        w.refresh(1000)
        w.refresh(2000)  # failed fetch keeps 25.0
        self.assertEqual(w.current(2000), 25.0)
        self.assertIsNone(w.current(1000 + STALE_AFTER_S + 1))


if __name__ == "__main__":
    unittest.main()
