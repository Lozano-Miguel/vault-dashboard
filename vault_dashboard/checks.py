"""Service probes. HTTP: any status < 500 means the service is answering (redirects are not
followed). TCP: an accepted connection means up."""
import socket
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    ms: int | None
    status: str


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # makes urllib raise HTTPError with the 3xx code instead of following


_opener = urllib.request.build_opener(_NoRedirect)


def _failure(reason):
    if isinstance(reason, TimeoutError) or "timed out" in str(reason):
        return "timeout"
    if isinstance(reason, ConnectionRefusedError):
        return "refused"
    return "error"


def _elapsed_ms(t0):
    return int((time.monotonic() - t0) * 1000)


def check_http(url, timeout=5.0):
    request = urllib.request.Request(url, headers={"User-Agent": "vault-dashboard"})
    t0 = time.monotonic()
    try:
        with _opener.open(request, timeout=timeout) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
        e.close()
    except (urllib.error.URLError, OSError) as e:
        return CheckResult(False, None, _failure(getattr(e, "reason", e)))
    ok = code < 500
    return CheckResult(ok, _elapsed_ms(t0) if ok else None, str(code))


def check_tcp(url, timeout=5.0):
    host, _, port = url[len("tcp://"):].rpartition(":")
    t0 = time.monotonic()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            pass
    except OSError as e:
        return CheckResult(False, None, _failure(e))
    return CheckResult(True, _elapsed_ms(t0), "ok")


def check(url, timeout=5.0):
    return check_tcp(url, timeout) if url.startswith("tcp://") else check_http(url, timeout)


def run_checks(services, timeout=5.0):
    if not services:
        return {}
    with ThreadPoolExecutor(max_workers=len(services)) as pool:
        futures = {s.id: pool.submit(check, s.check, timeout) for s in services}
        return {sid: f.result() for sid, f in futures.items()}
