"""HTTP: a GET-only JSON API plus the static frontend. Nothing here can change anything."""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from . import host

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


def public_config(cfg):
    return {
        "host": cfg.host,
        "network": cfg.network,
        "services": [{"id": s.id, "kind": s.kind, "parent": s.parent} for s in cfg.services],
        "thresholds": {"warn": cfg.temp_warn_c, "danger": cfg.temp_danger_c},
        "poll_ms": cfg.poll_ms,
        "tz": cfg.tz,
        "system": host.read_system_info(cfg.host_proc, cfg.host_sys, cfg.os_release),
    }


def make_handler(cfg, sampler, store):
    web_root = os.path.realpath(cfg.web_dir)
    config_body = json.dumps(public_config(cfg)).encode()

    class Handler(BaseHTTPRequestHandler):
        server_version = "vault-dashboard"

        def log_message(self, fmt, *args):
            pass  # the page polls every few seconds; access logs would be noise

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/api/live":
                return self._json(sampler.snapshot())
            if url.path == "/api/config":
                return self._send(200, "application/json", config_body)
            if url.path == "/api/events":
                values = parse_qs(url.query).get("after")
                try:
                    after = int(values[0]) if values else None
                except ValueError:
                    return self._send(400, "text/plain; charset=utf-8", b"after must be an integer")
                return self._json(store.events_after(after))
            if url.path == "/api/history":
                values = parse_qs(url.query).get("hours")
                try:
                    hours = int(values[0]) if values else 24
                except ValueError:
                    hours = 0
                if not 1 <= hours <= 24 * 7:
                    return self._send(400, "text/plain; charset=utf-8", b"hours must be 1..168")
                now = int(time.time())
                body = store.history(now - hours * 3600)
                return self._json({"interval": cfg.history_interval_s, "from": now - hours * 3600, "to": now, **body})
            if url.path.startswith("/api/"):
                return self._send(404, "text/plain; charset=utf-8", b"not found")
            self._static(url.path)

        def _not_allowed(self):
            self.send_response(405)
            self.send_header("Allow", "GET")
            self.send_header("Content-Length", "0")
            self.end_headers()

        do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = _not_allowed

        def _static(self, path):
            rel = "index.html" if path in ("", "/") else unquote(path).lstrip("/")
            full = os.path.realpath(os.path.join(web_root, rel))
            ext = os.path.splitext(full)[1]
            if os.path.commonpath([web_root, full]) != web_root or ext not in TYPES or not os.path.isfile(full):
                return self._send(404, "text/plain; charset=utf-8", b"not found")
            with open(full, "rb") as f:
                self._send(200, TYPES[ext], f.read())

        def _json(self, obj):
            self._send(200, "application/json", json.dumps(obj).encode())

        def _send(self, code, ctype, body):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    return Handler


def make_server(cfg, sampler, store, host="0.0.0.0"):
    server = ThreadingHTTPServer((host, cfg.port), make_handler(cfg, sampler, store))
    server.daemon_threads = True
    return server
