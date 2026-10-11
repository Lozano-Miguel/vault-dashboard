"""SQLite history: 5-minute samples, per-service availability, events, small meta table."""
import sqlite3
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

SAMPLE_FIELDS = (
    "cpu_temp", "cpu_temp_max", "outside_temp", "cpu_pct", "load1",
    "mem_used_mb", "mem_total_mb", "disk_used_gb", "disk_total_gb",
    "wifi_dbm", "wifi_quality", "rx_bps", "tx_bps", "throttle_delta",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS samples (
  ts INTEGER PRIMARY KEY,
  cpu_temp REAL, cpu_temp_max REAL, outside_temp REAL,
  cpu_pct REAL, load1 REAL,
  mem_used_mb INTEGER, mem_total_mb INTEGER,
  disk_used_gb REAL, disk_total_gb REAL,
  wifi_dbm INTEGER, wifi_quality INTEGER,
  rx_bps INTEGER, tx_bps INTEGER,
  throttle_delta INTEGER
);
CREATE TABLE IF NOT EXISTS service_samples (
  ts INTEGER, service_id TEXT,
  up_checks INTEGER, total_checks INTEGER, avg_ms INTEGER,
  PRIMARY KEY (ts, service_id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, kind TEXT, level TEXT, text TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def local_midnight(now, tz):
    d = datetime.fromtimestamp(now, ZoneInfo(tz))
    return int(d.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())


class Store:
    def __init__(self, path):
        self.lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        with self.lock:
            if path != ":memory:":
                self.db.execute("PRAGMA journal_mode=WAL")
            self.db.executescript(SCHEMA)

    def close(self):
        with self.lock:
            self.db.close()

    def _one(self, sql, args=()):
        with self.lock:
            return self.db.execute(sql, args).fetchone()

    def add_event(self, ts, kind, level, text):
        with self.lock:
            cur = self.db.execute("INSERT INTO events (ts, kind, level, text) VALUES (?, ?, ?, ?)",
                                  (ts, kind, level, text))
            return cur.lastrowid

    def events_after(self, after, limit=50):
        with self.lock:
            if after is None:
                rows = self.db.execute("SELECT id, ts, level, text FROM events ORDER BY id DESC LIMIT 12").fetchall()
                rows.reverse()
            else:
                rows = self.db.execute("SELECT id, ts, level, text FROM events WHERE id > ? ORDER BY id LIMIT ?",
                                       (after, limit)).fetchall()
        return [{"id": r[0], "ts": r[1], "level": r[2], "text": r[3]} for r in rows]

    def write_sample(self, ts, sample, services):
        cols = ", ".join(SAMPLE_FIELDS)
        marks = ", ".join("?" for _ in SAMPLE_FIELDS)
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute(f"INSERT OR REPLACE INTO samples (ts, {cols}) VALUES (?, {marks})",
                                (ts, *(sample.get(f) for f in SAMPLE_FIELDS)))
                self.db.executemany(
                    "INSERT OR REPLACE INTO service_samples VALUES (?, ?, ?, ?, ?)",
                    [(ts, sid, s["up_checks"], s["total_checks"], s["avg_ms"]) for sid, s in services.items()])
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def prune(self, now, retention_days):
        cutoff = now - retention_days * 86400
        with self.lock:
            for table in ("samples", "service_samples", "events"):
                self.db.execute(f"DELETE FROM {table} WHERE ts < ?", (cutoff,))

    def get_meta(self, key):
        row = self._one("SELECT value FROM meta WHERE key = ?", (key,))
        return row[0] if row else None

    def set_meta(self, key, value):
        with self.lock:
            self.db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, value))

    def throttle_today(self, now, tz):
        row = self._one("SELECT COALESCE(SUM(throttle_delta), 0) FROM samples WHERE ts > ?",
                        (local_midnight(now, tz),))
        return int(row[0])

    def ticker(self, now, tz):
        hot = self._one(
            "SELECT cpu_temp_max, ts FROM samples WHERE ts > ? AND cpu_temp_max IS NOT NULL "
            "ORDER BY cpu_temp_max DESC, ts DESC LIMIT 1", (local_midnight(now, tz),))
        up, total = self._one(
            "SELECT SUM(up_checks), SUM(total_checks) FROM service_samples WHERE ts > ?", (now - 7 * 86400,))
        last_outage = self._one("SELECT MAX(ts) FROM events WHERE kind = 'service_down'")[0]
        since = self._one("SELECT MIN(ts) FROM samples")[0]
        return {
            "hottest_today": {"c": round(hot[0]), "at": hot[1]} if hot else None,
            "availability_7d": round(100 * up / total, 1) if total else None,
            "last_outage": last_outage,
            "recording_since": since,
        }
