"""Configuration: environment variables plus the vault.json services file."""
import json
import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_WEB_DIR = str(Path(__file__).resolve().parent.parent / "web")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Service:
    id: str
    check: str
    parent: str | None = None

    @property
    def kind(self) -> str:
        return "site" if self.parent else "container"


@dataclass(frozen=True)
class Config:
    services: tuple[Service, ...]
    host: str = "vault"
    network: str = "homelab"
    readme: str = ""
    port: int = 8080
    tz: str = "Europe/Lisbon"
    temp_warn_c: float = 70.0
    temp_danger_c: float = 80.0
    poll_ms: int = 3000
    check_interval_s: int = 15
    history_interval_s: int = 300
    retention_days: int = 183
    wifi_iface: str = "wlan0"
    wifi_weak_dbm: int = -75
    host_proc: str = "/host/proc"
    host_sys: str = "/sys"
    thermal_zone: str = "auto"
    disk_path: str = "/data"
    data_dir: str = "/data"
    web_dir: str = DEFAULT_WEB_DIR
    latitude: float | None = None
    longitude: float | None = None


def _str(env, name, default):
    return env.get(name, "").strip() or default


def _num(env, name, default, cast, minimum=None):
    raw = env.get(name, "").strip()
    if raw == "":
        return default
    try:
        value = cast(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None
    if minimum is not None and value < minimum:
        raise ConfigError(f"{name} must be at least {minimum}, got {value}")
    return value


def parse_services(data):
    raw = data.get("services")
    if not isinstance(raw, list) or not raw:
        raise ConfigError("vault.json: 'services' must be a non-empty list")
    services, seen = [], set()
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("check"), str):
            raise ConfigError(f"vault.json: services[{i}] needs string 'id' and 'check'")
        sid, check, parent = item["id"].strip(), item["check"].strip(), item.get("parent")
        if not sid:
            raise ConfigError(f"vault.json: services[{i}] has an empty id")
        if sid in seen:
            raise ConfigError(f"vault.json: duplicate service id {sid!r}")
        if not check.startswith(("http://", "https://", "tcp://")):
            raise ConfigError(f"vault.json: {sid}: check must start with http://, https:// or tcp://")
        if check.startswith("tcp://"):
            host, _, port = check[len("tcp://"):].rpartition(":")
            if not host or not port.isdigit():
                raise ConfigError(f"vault.json: {sid}: tcp check must be tcp://host:port")
        if parent is not None and not isinstance(parent, str):
            raise ConfigError(f"vault.json: {sid}: parent must be a string")
        seen.add(sid)
        services.append(Service(sid, check, parent))
    containers = {s.id for s in services if s.parent is None}
    for s in services:
        if s.parent is not None and s.parent not in containers:
            raise ConfigError(f"vault.json: {s.id}: parent {s.parent!r} must be a service without a parent")
    return tuple(services)


def load_config(env=None):
    env = os.environ if env is None else env
    path = _str(env, "CONFIG_FILE", "/config/vault.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except OSError as e:
        raise ConfigError(f"cannot read {path}: {e.strerror}") from None
    except json.JSONDecodeError as e:
        raise ConfigError(f"{path} is not valid JSON: {e}") from None
    if not isinstance(data, dict):
        raise ConfigError(f"{path} must contain a JSON object")

    lat = _num(env, "LATITUDE", None, float)
    lon = _num(env, "LONGITUDE", None, float)
    if (lat is None) != (lon is None):
        raise ConfigError("set both LATITUDE and LONGITUDE, or neither")
    warn = _num(env, "TEMP_WARN_C", 70.0, float)
    danger = _num(env, "TEMP_DANGER_C", 80.0, float)
    if warn >= danger:
        raise ConfigError("TEMP_WARN_C must be below TEMP_DANGER_C")
    tz = _str(env, "TZ", "Europe/Lisbon")
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise ConfigError(f"TZ: unknown timezone {tz!r}") from None

    return Config(
        services=parse_services(data),
        host=str(data.get("host") or "vault"),
        network=str(data.get("network") or "homelab"),
        readme=str(data.get("readme") or ""),
        port=_num(env, "PORT", 8080, int, 0),
        tz=tz,
        temp_warn_c=warn,
        temp_danger_c=danger,
        poll_ms=_num(env, "POLL_MS", 3000, int, 250),
        check_interval_s=_num(env, "CHECK_INTERVAL_S", 15, int, 1),
        history_interval_s=_num(env, "HISTORY_INTERVAL_S", 300, int, 10),
        retention_days=_num(env, "RETENTION_DAYS", 183, int, 1),
        wifi_iface=_str(env, "WIFI_IFACE", "wlan0"),
        wifi_weak_dbm=_num(env, "WIFI_WEAK_DBM", -75, int),
        host_proc=_str(env, "HOST_PROC", "/host/proc"),
        host_sys=_str(env, "HOST_SYS", "/sys"),
        thermal_zone=_str(env, "THERMAL_ZONE", "auto"),
        disk_path=_str(env, "DISK_PATH", "/data"),
        data_dir=_str(env, "DATA_DIR", "/data"),
        web_dir=_str(env, "WEB_DIR", DEFAULT_WEB_DIR),
        latitude=lat,
        longitude=lon,
    )
