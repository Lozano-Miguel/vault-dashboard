import json
import threading
import time
import unittest
import urllib.error
import urllib.request

from tests.helpers import make_tree
from vault_dashboard.config import Config, Service
from vault_dashboard.server import make_server
from vault_dashboard.store import Store


class FakeSampler:
    def snapshot(self):
        return {"ts": 1, "cpu_temp": 61.0, "services": []}


class ServerTest(unittest.TestCase):
    def setUp(self):
        web = make_tree(self, {"index.html": "<h1>vault</h1>", "app.js": "1;", "secret.txt": "no"})
        proc = make_tree(self, {"sys/kernel/osrelease": "6.1.0-28-amd64\n"})
        cfg = Config(services=(Service("app", "http://app/"), Service("app.pt", "https://app.pt/", "app")),
                     port=0, web_dir=web, host_proc=proc, host_sys="/nonexistent", os_release="/nonexistent")
        self.store = Store(":memory:")
        self.addCleanup(self.store.close)
        self.server = make_server(cfg, FakeSampler(), self.store, host="127.0.0.1")
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def get(self, path, method="GET"):
        req = urllib.request.Request(self.base + path, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def test_live(self):
        code, headers, body = self.get("/api/live")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(json.loads(body)["cpu_temp"], 61.0)

    def test_config(self):
        cfg = json.loads(self.get("/api/config")[2])
        self.assertEqual(cfg["services"], [{"id": "app", "kind": "container", "parent": None},
                                           {"id": "app.pt", "kind": "site", "parent": "app"}])
        self.assertEqual(cfg["thresholds"], {"warn": 70.0, "danger": 80.0})
        self.assertEqual((cfg["host"], cfg["network"], cfg["poll_ms"], cfg["tz"]),
                         ("vault", "homelab", 3000, "Europe/Lisbon"))
        self.assertEqual(cfg["system"], {"os": None, "host": None, "kernel": "6.1.0-28-amd64", "cpu": None})
        self.assertNotIn("readme", cfg)
        self.assertNotIn("check", json.dumps(cfg))  # internal URLs stay private

    def test_events(self):
        for i in range(3):
            self.store.add_event(100 + i, "temp", "warn", f"e{i}")
        self.assertEqual([e["text"] for e in json.loads(self.get("/api/events")[2])], ["e0", "e1", "e2"])
        self.assertEqual([e["text"] for e in json.loads(self.get("/api/events?after=2")[2])], ["e2"])
        self.assertEqual(self.get("/api/events?after=abc")[0], 400)

    def test_history(self):
        now = int(time.time())
        self.store.write_sample(now - 600, {"cpu_temp": 55.0, "cpu_temp_max": 56.0, "throttle_delta": 0},
                                {"app": {"up_checks": 20, "total_checks": 20, "avg_ms": 40}})
        self.store.write_sample(now - 30 * 3600, {"cpu_temp": 40.0, "throttle_delta": 0}, {})
        h = json.loads(self.get("/api/history")[2])
        self.assertEqual(h["interval"], 300)
        self.assertAlmostEqual(h["to"] - h["from"], 24 * 3600, delta=2)
        self.assertEqual(h["samples"], [[now - 600, 55.0, 56.0, None]])
        self.assertEqual(h["services"], {"app": [[now - 600, 20, 20]]})
        self.assertEqual(len(json.loads(self.get("/api/history?hours=48")[2])["samples"]), 2)
        for bad in ("abc", "0", "1000"):
            self.assertEqual(self.get(f"/api/history?hours={bad}")[0], 400, bad)

    def test_static(self):
        code, headers, body = self.get("/")
        self.assertEqual((code, body), (200, b"<h1>vault</h1>"))
        self.assertTrue(headers["Content-Type"].startswith("text/html"))
        self.assertEqual(self.get("/app.js")[0], 200)

    def test_unknown_paths_and_types_are_404(self):
        self.assertEqual(self.get("/api/nope")[0], 404)
        self.assertEqual(self.get("/missing.js")[0], 404)
        self.assertEqual(self.get("/secret.txt")[0], 404)  # extension not served

    def test_no_path_traversal(self):
        for path in ("/../config.py", "/%2e%2e/config.py", "/..%2f..%2fetc/passwd"):
            self.assertEqual(self.get(path)[0], 404, path)

    def test_only_get(self):
        for method in ("POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"):
            self.assertEqual(self.get("/api/live", method)[0], 405, method)


if __name__ == "__main__":
    unittest.main()
