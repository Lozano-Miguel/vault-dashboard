"""Outside temperature from Open-Meteo (free, no API key). Optional: disabled without coordinates."""
import json
import urllib.request

URL = "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m"
STALE_AFTER_S = 3 * 3600


def fetch_outside_temp(lat, lon, timeout=10.0, opener=None):
    open_url = opener or urllib.request.urlopen
    try:
        with open_url(URL.format(lat=lat, lon=lon), timeout=timeout) as resp:
            data = json.load(resp)
        return float(data["current"]["temperature_2m"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


class Weather:
    def __init__(self, lat, lon, fetch=fetch_outside_temp):
        self.lat, self.lon, self.fetch = lat, lon, fetch
        self.value = None
        self.at = None

    @property
    def enabled(self):
        return self.lat is not None and self.lon is not None

    def refresh(self, now):
        if not self.enabled:
            return
        value = self.fetch(self.lat, self.lon)
        if value is not None:
            self.value, self.at = value, now

    def current(self, now):
        if self.at is None or now - self.at > STALE_AFTER_S:
            return None
        return self.value
