"""RPC health, latency and circuit breaker for Portaldot V3 endpoints.

Each endpoint is probed with a real JSON-RPC call (system_health + chain_getHeader).
Values are measured now; nothing is estimated. Failures open a per-endpoint circuit
breaker so repeated timeouts stop hammering a dead endpoint, then half-open after a cooldown.
"""
import os
import time
import threading
import requests
import sqlite3
from contextlib import closing

DEFAULT_ENDPOINTS = ["wss://test-node-v3.portaldot.dev", "https://test-evm-rpc-v3.portaldot.dev"]
HTTP_FALLBACK = {"wss://test-node-v3.portaldot.dev": "https://test-node-v3.portaldot.dev"}
EXPECTED_EVM_CHAIN_ID = 420420777
FAILURE_THRESHOLD = int(os.getenv("V3_RPC_BREAKER_THRESHOLD", "3"))
COOLDOWN_S = float(os.getenv("V3_RPC_BREAKER_COOLDOWN", "60"))
PROBE_TIMEOUT_S = float(os.getenv("V3_RPC_PROBE_TIMEOUT", "8"))
SLOW_MS = int(os.getenv("V3_RPC_SLOW_MS", "1000"))
DEGRADED_MS = int(os.getenv("V3_RPC_DEGRADED_MS", "3000"))
HISTORY_LIMIT = int(os.getenv("V3_RPC_HISTORY_LIMIT", "20"))
HISTORY_DB = os.getenv("V3_RPC_HISTORY_DB", os.path.join(os.path.dirname(__file__), "data", "rpc_health.db"))


def _init_history():
    os.makedirs(os.path.dirname(HISTORY_DB), exist_ok=True)
    with closing(sqlite3.connect(HISTORY_DB)) as con:
        con.execute("""CREATE TABLE IF NOT EXISTS rpc_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL,
            chain_family TEXT NOT NULL, checked_at INTEGER NOT NULL,
            latency_ms INTEGER, block_number INTEGER, ok INTEGER NOT NULL,
            state TEXT NOT NULL, error TEXT, source TEXT NOT NULL,
            failure_kind TEXT
        )""")
        cols = [row[1] for row in con.execute("PRAGMA table_info(rpc_samples)").fetchall()]
        if "failure_kind" not in cols:
            con.execute("ALTER TABLE rpc_samples ADD COLUMN failure_kind TEXT")
        con.execute("CREATE INDEX IF NOT EXISTS idx_rpc_samples_endpoint_time ON rpc_samples(endpoint, checked_at DESC)")
        con.commit()


def _store(rows):
    _init_history()
    with closing(sqlite3.connect(HISTORY_DB)) as con:
        con.executemany("""INSERT INTO rpc_samples
            (endpoint, chain_family, checked_at, latency_ms, block_number, ok, state, error, source, failure_kind)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", [
                (r["endpoint"], r["chain_family"], r["checked_at"], r["latency_ms"], r["block_number"],
                 int(r["ok"]), r["state"], r["error"], r["source"], r.get("failure_kind")) for r in rows])
        con.commit()


def _percentile(values, p):
    if not values: return None
    values = sorted(values)
    return values[min(len(values) - 1, int((len(values) - 1) * p))]


def _history(endpoint, since=None):
    _init_history()
    with closing(sqlite3.connect(HISTORY_DB)) as con:
        con.row_factory = sqlite3.Row
        if since is None:
            rows = con.execute("SELECT * FROM rpc_samples WHERE endpoint=? ORDER BY checked_at DESC, id DESC LIMIT ?", (endpoint, HISTORY_LIMIT)).fetchall()
            rows = [dict(row) for row in reversed(rows)]
        else:
            rows = con.execute("SELECT * FROM rpc_samples WHERE endpoint=? AND checked_at>=? ORDER BY checked_at ASC, id ASC", (endpoint, since)).fetchall()
            rows = [dict(row) for row in rows]
    latencies = [r["latency_ms"] for r in rows if r["latency_ms"] is not None]
    total = len(rows)
    failed = sum(1 for r in rows if not r["ok"])
    kinds = {"transport": 0, "protocol": 0, "internal": 0}
    for r in rows:
        if not r["ok"] and r.get("failure_kind") in kinds:
            kinds[r["failure_kind"]] += 1
    blocks = [(r["checked_at"], r["block_number"]) for r in rows if r["block_number"] is not None]
    last_change_at = None
    if blocks:
        last_block = blocks[-1][1]
        last_change_at = blocks[-1][0]
        for ts, block in reversed(blocks):
            if block != last_block:
                break
            last_change_at = ts
    return {
        "sample_count": total, "history_limit": HISTORY_LIMIT,
        "history_scope": "backend persisted samples",
        "error_rate": round(failed / total, 4) if total else None,
        "failures": {"total": failed, "by_kind": kinds, "endpoint_failures": kinds["transport"] + kinds["protocol"], "backend_failures": kinds["internal"]},
        "p50_ms": _percentile(latencies, .50), "p90_ms": _percentile(latencies, .90), "p99_ms": _percentile(latencies, .99),
        "block_progress": {
            "first_block": blocks[0][1] if blocks else None, "last_block": blocks[-1][1] if blocks else None,
            "delta": (blocks[-1][1] - blocks[0][1]) if blocks else None,
            "last_change_at": last_change_at,
            "seconds_since_change": (blocks[-1][0] - last_change_at) if blocks else None,
            "stale_for_seconds": (int(time.time()) - last_change_at) if last_change_at else None,
            "reference": "chain-specific head sampled from this endpoint",
        },
        "samples": [{"checked_at": r["checked_at"], "latency_ms": r["latency_ms"], "ok": bool(r["ok"]),
                     "block_number": r["block_number"], "failure_kind": r.get("failure_kind")} for r in rows]
    }


def failure_kind(exc):
    """transport: endpoint unreachable/timeout/HTTP error. protocol: endpoint answered but wrong.
    internal: anything raised by our own code, i.e. a backend failure, not an endpoint failure."""
    import requests
    if isinstance(exc, (requests.exceptions.ConnectionError, requests.exceptions.Timeout, requests.exceptions.HTTPError)):
        return "transport"
    if isinstance(exc, RuntimeError):
        return "protocol"
    return "internal"


def _latency_status(latency, ok):
    if not ok: return "failing"
    if latency is None: return "unknown"
    if latency > DEGRADED_MS: return "degraded"
    if latency >= SLOW_MS: return "slow"
    return "healthy"


def endpoints():
    raw = os.getenv("V3_RPC_ENDPOINTS", "")
    items = [x.strip() for x in raw.split(",") if x.strip()]
    return items or list(DEFAULT_ENDPOINTS)


class Breaker:
    def __init__(self):
        self.failures = 0
        self.opened_at = None
        self.last_error = None
        self.lock = threading.Lock()

    def state(self):
        if self.opened_at is None:
            return "closed"
        if time.time() - self.opened_at >= COOLDOWN_S:
            return "half_open"
        return "open"

    def record_ok(self):
        with self.lock:
            self.failures = 0
            self.opened_at = None
            self.last_error = None

    def record_fail(self, err):
        with self.lock:
            self.failures += 1
            self.last_error = str(err)[:200]
            if self.failures >= FAILURE_THRESHOLD:
                self.opened_at = time.time()


_BREAKERS = {}
_LOCK = threading.Lock()


def _breaker(url):
    with _LOCK:
        return _BREAKERS.setdefault(url, Breaker())


def _http_url(ws):
    return HTTP_FALLBACK.get(ws) or ws.replace("wss://", "https://").replace("ws://", "http://")


def _rpc(url, method, params):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    r = requests.post(url, json=body, timeout=PROBE_TIMEOUT_S)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(str(data["error"])[:200])
    return data.get("result")


def family_of(url):
    return "evm" if url.startswith("http") and "evm" in url.lower() else "substrate"


def probe_evm(url):
    chain_hex = _rpc(url, "eth_chainId", [])
    chain_id = int(chain_hex, 16) if chain_hex else None
    if chain_id != EXPECTED_EVM_CHAIN_ID:
        raise RuntimeError(f"unexpected eth_chainId {chain_id}, expected {EXPECTED_EVM_CHAIN_ID}")
    number = int(_rpc(url, "eth_blockNumber", []), 16)
    return number, "eth_chainId + eth_blockNumber"


def probe(ws):
    """Measure one endpoint. Returns a dict with measured fields only."""
    b = _breaker(ws)
    state = b.state()
    checked_at = int(time.time())
    if state == "open":
        return {"endpoint": ws, "chain_family": family_of(ws), "state": "open", "ok": False, "latency_ms": None,
                "block_number": None, "error": b.last_error, "checked_at": checked_at,
                "source": "rpc_health circuit breaker"}
    started = time.time()
    family = family_of(ws)
    try:
        if family == "evm":
            number, method = probe_evm(ws)
            url = ws
        else:
            url = _http_url(ws)
            header = _rpc(url, "chain_getHeader", [])
            number = int(header["number"], 16) if header and header.get("number") else None
            method = "chain_getHeader"
        latency = round((time.time() - started) * 1000)
        b.record_ok()
        return {"endpoint": ws, "chain_family": family, "state": "closed", "ok": True, "latency_ms": latency,
                "block_number": number, "error": None, "checked_at": checked_at,
                "source": f"live JSON-RPC {method} via {url}"}
    except Exception as exc:
        b.record_fail(exc)
        return {"endpoint": ws, "chain_family": family_of(ws), "state": b.state(), "ok": False,
                "latency_ms": round((time.time() - started) * 1000),
                "block_number": None, "error": str(exc)[:200], "checked_at": checked_at,
                "failure_kind": failure_kind(exc), "source": "live JSON-RPC probe failed"}


def report(window="latest"):
    windows = {"1h": 3600, "24h": 86400, "7d": 604800}
    since = int(time.time()) - windows[window] if window in windows else None
    rows = [probe(ws) for ws in endpoints()]
    for row in rows:
        row["latency_status"] = _latency_status(row["latency_ms"], row["ok"])
        row["slow_threshold_ms"] = SLOW_MS
        row["degraded_threshold_ms"] = DEGRADED_MS
        row["history"] = _history(row["endpoint"], since)
    _store(rows)
    # Include the just-recorded sample in response history.
    for row in rows:
        row["history"] = _history(row["endpoint"], since)
    return {"endpoints": rows, "count": len(rows),
            "healthy": sum(1 for r in rows if r["ok"]),
            "generated_at": int(time.time()),
            "history_scope": "backend persisted samples, latest 20 per endpoint",
            "thresholds": {"slow_ms": SLOW_MS, "degraded_ms": DEGRADED_MS},
            "window": window, "window_seconds": windows.get(window)}
