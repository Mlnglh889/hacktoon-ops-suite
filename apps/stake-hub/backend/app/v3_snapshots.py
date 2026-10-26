"""Persistent V3 validator snapshots + change detection.

Read-only. Every row is tied to the chain head/era it was read at, so the UI can
show source and timestamp. Stale data is kept and flagged, never replaced by
"Unavailable". No synthetic values are written: a field that failed to read is
stored as NULL with the error text.
"""
import os
import sqlite3
import time

DB_PATH = os.getenv(
    "V3_SNAPSHOT_DB",
    os.path.join(os.path.dirname(__file__), "data", "v3_snapshots.db"),
)
DECIMALS = 10**14


def _con():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _con() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS v3_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                taken_at INTEGER NOT NULL,
                block_number INTEGER,
                era INTEGER,
                source TEXT NOT NULL,
                validator_count INTEGER,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS v3_validator_rows (
                snapshot_id INTEGER NOT NULL REFERENCES v3_snapshots(id),
                address TEXT NOT NULL,
                commission_pct TEXT,
                total_pot TEXT,
                own_pot TEXT,
                nominator_count INTEGER,
                points INTEGER,
                errors TEXT,
                PRIMARY KEY (snapshot_id, address)
            );
            CREATE TABLE IF NOT EXISTS v3_changes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                detected_at INTEGER NOT NULL,
                snapshot_id INTEGER NOT NULL REFERENCES v3_snapshots(id),
                address TEXT,
                field TEXT NOT NULL,
                old_value TEXT,
                new_value TEXT
            );
            """
        )


def save_snapshot(block_number, era, source, rows, taken_at=None):
    """Save one snapshot and return (snapshot_id, changes). rows: list of dicts."""
    import json

    taken_at = int(taken_at or time.time())
    init_db()
    with _con() as con:
        prev = con.execute(
            "SELECT id FROM v3_snapshots ORDER BY id DESC LIMIT 1"
        ).fetchone()
        cur = con.execute(
            "INSERT INTO v3_snapshots (taken_at, block_number, era, source, validator_count, payload)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (taken_at, block_number, era, source, len(rows), json.dumps(rows)),
        )
        sid = cur.lastrowid
        for r in rows:
            con.execute(
                "INSERT INTO v3_validator_rows (snapshot_id, address, commission_pct, total_pot,"
                " own_pot, nominator_count, points, errors) VALUES (?,?,?,?,?,?,?,?)",
                (
                    sid,
                    r["address"],
                    r.get("commission_pct"),
                    r.get("total_pot"),
                    r.get("own_pot"),
                    r.get("nominator_count"),
                    r.get("points"),
                    json.dumps(r.get("data_errors") or []),
                ),
            )
        changes = diff_snapshots(con, prev["id"] if prev else None, sid)
        for c in changes:
            con.execute(
                "INSERT INTO v3_changes (detected_at, snapshot_id, address, field, old_value, new_value)"
                " VALUES (?,?,?,?,?,?)",
                (taken_at, sid, c["address"], c["field"], c["old"], c["new"]),
            )
    return sid, changes


FIELDS = ["commission_pct", "total_pot", "own_pot", "nominator_count", "points"]


def _rows_by_addr(con, sid):
    out = {}
    for r in con.execute("SELECT * FROM v3_validator_rows WHERE snapshot_id=?", (sid,)):
        out[r["address"]] = dict(r)
    return out


def diff_snapshots(con, old_id, new_id):
    """Field-level diff. Membership changes are reported as field='membership'."""
    new = _rows_by_addr(con, new_id)
    old = _rows_by_addr(con, old_id) if old_id else {}
    changes = []
    for addr in sorted(set(old) | set(new)):
        if addr not in old:
            changes.append({"address": addr, "field": "membership", "old": None, "new": "added"})
            continue
        if addr not in new:
            changes.append({"address": addr, "field": "membership", "old": "present", "new": "removed"})
            continue
        for f in FIELDS:
            if old[addr][f] != new[addr][f]:
                changes.append({"address": addr, "field": f, "old": old[addr][f], "new": new[addr][f]})
    return changes


def latest(n=1):
    init_db()
    with _con() as con:
        rows = con.execute(
            "SELECT id, taken_at, block_number, era, source, validator_count FROM v3_snapshots"
            " ORDER BY id DESC LIMIT ?",
            (n,),
        ).fetchall()
        return [dict(r) for r in rows]


def recent_changes(limit=50):
    init_db()
    with _con() as con:
        rows = con.execute(
            "SELECT * FROM v3_changes ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Collector + read-only API. Reads through the same live path as /api/v3/validators.
# A failed poll is logged and skipped; it never clears the last stored snapshot.
# ---------------------------------------------------------------------------
import logging
import threading

from fastapi import APIRouter

log = logging.getLogger("v3_snapshots")
router = APIRouter(prefix="/api/v3/snapshots", tags=["v3-snapshots"])
INTERVAL = int(os.getenv("V3_SNAPSHOT_INTERVAL", "300"))
_state = {"last_ok": None, "last_error": None, "running": False}


def _read_chain_once(v3):
    with v3._SS_LOCK:
        ss = v3._new_substrate()
        head = ss.get_block_header()["header"]["number"]
    payload = v3._validators_uncached()
    return head, payload


def collect_once():
    import v3  # local import: keeps module importable without the chain stack

    # Same policy as the API path in v3.py: on a dead websocket, reset the
    # shared connection and retry once. Without this, one broken pipe kept
    # the collector failing until the service was restarted.
    last_error = None
    for attempt in range(2):
        try:
            head, payload = _read_chain_once(v3)
            break
        except Exception as exc:
            last_error = exc
            v3._reset_substrate()
            v3._invalidate_snapshot()
            log.warning("v3 snapshot attempt %s failed: %s", attempt + 1, exc)
    else:
        raise last_error
    era = None
    rows = payload["validators"]
    for r in rows:
        era = r.get("era", era)
    sid, changes = save_snapshot(
        head, era, f"chain:{v3.WS_URL}", rows
    )
    return {"snapshot_id": sid, "block_number": head, "era": era,
            "validator_count": len(rows), "changes": len(changes)}


def _loop():
    while True:
        try:
            res = collect_once()
            _state.update(last_ok=int(time.time()), last_error=None)
            log.info("v3 snapshot %s", res)
        except Exception as exc:  # keep polling; stale data stays in DB
            _state["last_error"] = f"{type(exc).__name__}: {exc}"[:300]
            log.warning("v3 snapshot failed: %s", _state["last_error"])
        time.sleep(INTERVAL)


def start_collector():
    if _state["running"] or os.getenv("V3_SNAPSHOT_DISABLE") == "1":
        return
    _state["running"] = True
    threading.Thread(target=_loop, name="v3-snapshot", daemon=True).start()


@router.get("/latest")
def latest_snapshot():
    rows = latest(1)
    age = (int(time.time()) - rows[0]["taken_at"]) if rows else None
    return {
        "snapshot": rows[0] if rows else None,
        "age_seconds": age,
        "stale": (age is None) or age > 2 * INTERVAL,
        "collector": dict(_state),
        "source": "stored snapshot (chain read at taken_at)",
    }


@router.get("/changes")
def changes(limit: int = 50):
    return {"changes": recent_changes(max(1, min(limit, 500)))}
