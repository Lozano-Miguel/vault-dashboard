"""Turns state changes into console events. Pure functions: no I/O, no clock."""
from dataclasses import dataclass

FAILS_TO_DOWN = 2

HTTP_REASONS = {
    500: "internal error", 502: "bad gateway", 503: "unavailable", 504: "gateway timeout",
    520: "origin error", 521: "origin down", 522: "origin timeout", 523: "origin unreachable",
    524: "origin timeout", 530: "tunnel error",
}


@dataclass(frozen=True)
class Event:
    kind: str
    level: str
    text: str


@dataclass(frozen=True)
class ServiceState:
    up: bool | None
    fails: int
    ms: int | None
    status: str
    since: float


def initial_service_state(now):
    return ServiceState(None, 0, None, "", now)


def update_service(prev, result, now):
    if result.ok:
        up, fails = True, 0
    else:
        fails = prev.fails + 1
        up = False if fails >= FAILS_TO_DOWN else prev.up
    since = prev.since if up == prev.up else now
    return ServiceState(up, fails, result.ms, result.status, since)


def duration(seconds):
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h {s % 3600 // 60}m"
    return f"{s // 86400}d {s % 86400 // 3600}h"


def _down_text(sid, status):
    if status.isdigit():
        code = int(status)
        return f"{sid} {code} {HTTP_REASONS.get(code, 'error')}"
    if status == "timeout":
        return f"{sid} DOWN · no answer"
    if status == "refused":
        return f"{sid} DOWN · refused"
    return f"{sid} DOWN"


def service_events(sid, prev, new, now):
    if new.up is False and prev.up is not False:
        return [Event("service_down", "alarm", _down_text(sid, new.status))]
    if new.up is True and prev.up is False:
        return [Event("service_up", "normal", f"{sid} back up · down {duration(now - prev.since)}")]
    return []


def temp_level(prev, temp, warn, danger, hyst=3.0):
    if temp is None:
        return prev
    if temp >= danger:
        return "danger"
    if temp >= warn:
        return "danger" if prev == "danger" and temp > danger - hyst else "warn"
    if prev in ("warn", "danger") and temp > warn - hyst:
        return "warn"
    return "normal"


def temp_events(prev, new, temp):
    if new == prev or temp is None:
        return []
    t = round(temp)
    if new == "danger":
        return [Event("temp", "alarm", f"temp {t}°C · DANGER")]
    if new == "warn" and prev == "normal":
        return [Event("temp", "warn", f"temp {t}°C · warm")]
    if new == "normal":
        return [Event("temp", "normal", f"temp {t}°C · cooling")]
    return []


THROTTLE_COOLDOWN_S = 600


def throttle_events(prev_today, new_today, now=None, last_emit=None, cooldown=THROTTLE_COOLDOWN_S):
    # A CPU at its thermal limit throttles many times a second; announce it at most every 10 min
    # so a hot afternoon can't flood the console and push DOWN lines off screen.
    if new_today <= prev_today:
        return []
    if last_emit is not None and now is not None and now - last_emit < cooldown:
        return []
    return [Event("throttle", "warn", f"throttle #{new_today}")]


def wifi_state(prev, wifi, weak_dbm, hyst=3):
    if wifi is None:
        return "lost"
    if wifi["dbm"] < weak_dbm:
        return "weak"
    if prev == "weak" and wifi["dbm"] < weak_dbm + hyst:
        return "weak"
    return "ok"


def wifi_events(prev, new, wifi):
    if prev is None or new == prev:
        return []
    if new == "lost":
        return [Event("wifi", "alarm", "wifi lost")]
    if prev == "lost":
        return [Event("wifi", "normal", f"wifi back {wifi['dbm']}dBm")]
    if new == "weak":
        return [Event("wifi", "warn", f"wifi weak {wifi['dbm']}dBm")]
    return []


def boot_events(last_boot, boot, tolerance=60):
    if last_boot is None or boot is None or abs(boot - last_boot) <= tolerance:
        return []
    return [Event("boot", "dim", "boot")]
