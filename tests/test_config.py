import json
import os
import unittest

from tests.helpers import make_tree
from vault_dashboard.config import ConfigError, load_config

SERVICES = [
    {"id": "app", "check": "http://app:3000/"},
    {"id": "db", "check": "tcp://db:5432"},
    {"id": "app.example", "check": "https://app.example/", "parent": "app"},
]


class LoadConfigTest(unittest.TestCase):
    def cfg_file(self, data):
        root = make_tree(self, {"vault.json": json.dumps(data)})
        return os.path.join(root, "vault.json")

    def load(self, data=None, **env):
        data = {"services": SERVICES} if data is None else data
        return load_config({"CONFIG_FILE": self.cfg_file(data), **env})

    def test_defaults(self):
        cfg = self.load()
        self.assertEqual(cfg.port, 8080)
        self.assertEqual(cfg.tz, "Europe/Lisbon")
        self.assertEqual((cfg.temp_warn_c, cfg.temp_danger_c), (70.0, 80.0))
        self.assertEqual(cfg.check_interval_s, 15)
        self.assertEqual(cfg.history_interval_s, 300)
        self.assertEqual(cfg.retention_days, 183)
        self.assertIsNone(cfg.latitude)
        self.assertEqual(cfg.host, "vault")
        self.assertEqual(cfg.network, "homelab")
        self.assertEqual(cfg.os_release, "/host/os-release")
        self.assertFalse(hasattr(cfg, "readme"))
        self.assertEqual([s.id for s in cfg.services], ["app", "db", "app.example"])
        self.assertEqual([s.kind for s in cfg.services], ["container", "container", "site"])

    def test_env_and_json_overrides(self):
        cfg = self.load({"host": "box", "network": "net1", "services": SERVICES},
                        PORT="9000", WIFI_IFACE="wlp2s0", LATITUDE="38.7", LONGITUDE="-9.1", TZ="UTC",
                        OS_RELEASE="/etc/os-release")
        self.assertEqual((cfg.port, cfg.wifi_iface, cfg.tz), (9000, "wlp2s0", "UTC"))
        self.assertEqual((cfg.latitude, cfg.longitude), (38.7, -9.1))
        self.assertEqual((cfg.host, cfg.network, cfg.os_release), ("box", "net1", "/etc/os-release"))

    def test_bad_number_names_the_variable(self):
        with self.assertRaisesRegex(ConfigError, "PORT"):
            self.load(PORT="eighty")

    def test_warn_must_be_below_danger(self):
        with self.assertRaisesRegex(ConfigError, "TEMP_WARN_C"):
            self.load(TEMP_WARN_C="85")

    def test_latitude_without_longitude(self):
        with self.assertRaisesRegex(ConfigError, "LATITUDE"):
            self.load(LATITUDE="38.7")

    def test_unknown_timezone(self):
        with self.assertRaisesRegex(ConfigError, "TZ"):
            self.load(TZ="Mars/Olympus")

    def test_missing_file(self):
        with self.assertRaisesRegex(ConfigError, "cannot read"):
            load_config({"CONFIG_FILE": "/nonexistent/vault.json"})

    def test_invalid_json(self):
        root = make_tree(self, {"vault.json": "{not json"})
        with self.assertRaisesRegex(ConfigError, "not valid JSON"):
            load_config({"CONFIG_FILE": os.path.join(root, "vault.json")})

    def test_empty_services(self):
        with self.assertRaisesRegex(ConfigError, "non-empty"):
            self.load({"services": []})

    def test_duplicate_id(self):
        with self.assertRaisesRegex(ConfigError, "duplicate"):
            self.load({"services": [SERVICES[0], SERVICES[0]]})

    def test_bad_scheme(self):
        with self.assertRaisesRegex(ConfigError, "must start with"):
            self.load({"services": [{"id": "x", "check": "ftp://x"}]})

    def test_bad_tcp_target(self):
        with self.assertRaisesRegex(ConfigError, "tcp://host:port"):
            self.load({"services": [{"id": "x", "check": "tcp://db"}]})

    def test_parent_must_be_a_container(self):
        bad = SERVICES + [{"id": "deep", "check": "https://deep/", "parent": "app.example"}]
        with self.assertRaisesRegex(ConfigError, "parent"):
            self.load({"services": bad})


if __name__ == "__main__":
    unittest.main()
