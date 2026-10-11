import socket
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from vault_dashboard.checks import check, run_checks
from vault_dashboard.config import Service


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == "/slow":
            time.sleep(2)
        code = {"/ok": 200, "/slow": 200, "/missing": 404, "/moved": 301, "/bad": 502}.get(self.path, 404)
        self.send_response(code)
        if code == 301:
            self.send_header("Location", "/bad")  # following it would turn this into a failure
        self.send_header("Content-Length", "0")
        self.end_headers()


class ChecksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        cls.server.daemon_threads = True
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_200_is_up_with_timing(self):
        r = check(self.base + "/ok")
        self.assertTrue(r.ok)
        self.assertEqual(r.status, "200")
        self.assertIsInstance(r.ms, int)

    def test_404_counts_as_up(self):
        r = check(self.base + "/missing")
        self.assertTrue(r.ok)
        self.assertEqual(r.status, "404")

    def test_redirect_not_followed(self):
        r = check(self.base + "/moved")
        self.assertTrue(r.ok)
        self.assertEqual(r.status, "301")

    def test_502_is_down(self):
        r = check(self.base + "/bad")
        self.assertFalse(r.ok)
        self.assertEqual(r.status, "502")
        self.assertIsNone(r.ms)

    def test_timeout(self):
        r = check(self.base + "/slow", timeout=0.3)
        self.assertEqual((r.ok, r.status), (False, "timeout"))

    def test_unresolvable_host_is_down(self):
        r = check("http://no-such-container.invalid/", timeout=2)
        self.assertEqual((r.ok, r.status), (False, "error"))

    def test_tcp_open_and_refused(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        self.assertEqual(check(f"tcp://127.0.0.1:{port}").status, "ok")
        listener.close()
        r = check(f"tcp://127.0.0.1:{port}", timeout=1)
        self.assertEqual((r.ok, r.status), (False, "refused"))

    def test_non_http_reply_is_down_and_does_not_sink_the_batch(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        self.addCleanup(listener.close)

        def answer_garbage():
            conn, _ = listener.accept()
            conn.recv(1024)
            conn.sendall(b"garbage not http\r\n\r\n")
            conn.close()

        threading.Thread(target=answer_garbage, daemon=True).start()
        garbage = f"http://127.0.0.1:{listener.getsockname()[1]}/"
        results = run_checks([Service("weird", garbage), Service("ok", self.base + "/ok")], timeout=2)
        self.assertEqual((results["weird"].ok, results["weird"].status), (False, "error"))
        self.assertTrue(results["ok"].ok)

    def test_invalid_url_is_down(self):
        r = check("http://127.0.0.1:abc/", timeout=1)
        self.assertEqual((r.ok, r.status), (False, "error"))

    def test_run_checks_is_parallel_and_keyed_by_id(self):
        services = [Service(f"s{i}", self.base + "/slow") for i in range(3)]
        t0 = time.monotonic()
        results = run_checks(services, timeout=0.5)
        self.assertLess(time.monotonic() - t0, 1.4)
        self.assertEqual(sorted(results), ["s0", "s1", "s2"])
        self.assertTrue(all(r.status == "timeout" for r in results.values()))


if __name__ == "__main__":
    unittest.main()
