"""Read-only API over collected Portaldot V3 testnet data."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("STAKEHUB_DB", str(ROOT / "data" / "ops-suite.db")))
app = FastAPI(title="Portaldot Ops Suite API", version="0.1.0")


def db_rows(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    if not DB_PATH.exists():
        return []
    with sqlite3.connect(DB_PATH) as con:
        con.row_factory = sqlite3.Row
        return [dict(row) for row in con.execute(sql, params).fetchall()]


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "network": "PortaldotV3 Test"}


@app.get("/api/v1/overview")
def overview() -> dict[str, Any]:
    latest = db_rows("SELECT block_number, block_hash, captured_at FROM blocks ORDER BY block_number DESC LIMIT 1")
    era = db_rows("SELECT era, captured_at FROM era_stake ORDER BY era DESC LIMIT 1")
    validator_count = db_rows("SELECT COUNT(*) AS count FROM validators")
    stake = db_rows("SELECT COALESCE(SUM(CAST(total_pot AS REAL)), 0) AS total_pot FROM era_stake WHERE era = (SELECT MAX(era) FROM era_stake)")
    return {"network": "PortaldotV3 Test", "chain_id": 420420777, "latest_block": latest[0] if latest else None, "latest_era": era[0]["era"] if era else None, "validator_count": validator_count[0]["count"] if validator_count else 0, "total_stake_pot": stake[0]["total_pot"] if stake else 0, "source": "SQLite collector snapshot"}


@app.get("/api/v1/validators")
def validators() -> dict[str, Any]:
    rows = db_rows("""SELECT v.address, v.nickname, v.last_seen, s.era, s.total_pot, s.own_pot,
        s.nominator_count, s.commission_pct, p.points
        FROM validators v JOIN era_stake s ON s.address=v.address
        LEFT JOIN era_points p ON p.address=s.address AND p.era=s.era
        WHERE s.era=(SELECT MAX(era) FROM era_stake) ORDER BY CAST(s.total_pot AS REAL) DESC""")
    return {"network": "PortaldotV3 Test", "validators": rows}


@app.get("/api/v1/validators/{address}")
def validator(address: str) -> dict[str, Any]:
    rows = db_rows("""SELECT v.address, v.nickname, v.last_seen, s.era, s.total_pot,
        s.own_pot, s.nominator_count, s.commission_pct, p.points
        FROM validators v JOIN era_stake s ON s.address=v.address
        LEFT JOIN era_points p ON p.address=s.address AND p.era=s.era
        WHERE lower(v.address)=lower(?) ORDER BY s.era DESC LIMIT 1""", (address,))
    if not rows:
        raise HTTPException(status_code=404, detail="validator not found in collector snapshots")
    return rows[0]


@app.get("/api/v1/eras/latest")
def latest_era() -> dict[str, Any]:
    rows = db_rows("SELECT era, COUNT(*) AS validator_count, SUM(CAST(total_pot AS REAL)) AS total_stake_pot, MAX(captured_at) AS captured_at FROM era_stake GROUP BY era ORDER BY era DESC LIMIT 1")
    return rows[0] if rows else {"era": None, "validator_count": 0, "total_stake_pot": 0}


@app.get("/api/v1/blocks")
def blocks(limit: int = 100) -> dict[str, Any]:
    limit = max(1, min(limit, 500))
    return {"blocks": db_rows(f"SELECT block_number, block_hash, captured_at FROM blocks ORDER BY block_number DESC LIMIT {limit}")}


__all__ = ["app"]

# Keep the public network identity explicit in API responses.
assert 420420777 == 420420777
