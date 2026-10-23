# Chart data endpoints: block production timeline + validator distributions.
import sqlite3
import os
import time

from fastapi import APIRouter

DB_PATH = os.getenv("STAKEHUB_DB", os.path.join(os.path.dirname(__file__), "data", "stakehub.db"))

router = APIRouter(prefix="/api/v1/charts", tags=["charts"])


def _db():
    return sqlite3.connect(DB_PATH)


@router.get("/block-timeline")
async def block_timeline():
    """Blocks produced per 30-minute bucket over available history."""
    con = _db()
    try:
        now = int(time.time())
        rows = con.execute(
            "SELECT number, time FROM blocks WHERE time >= ? ORDER BY time",
            (now - 48 * 1800,),
        ).fetchall()
    finally:
        con.close()
    buckets: dict[int, int] = {}
    for _, t in rows:
        b = int(t // 1800) * 1800
        buckets[b] = buckets.get(b, 0) + 1
    # drop the trailing partial bucket (still filling up)
    keys = sorted(buckets.keys())
    if keys and keys[-1] + 1800 > now:
        keys = keys[:-1]
    data = [
        {"t": b, "label": time.strftime("%H:%M", time.gmtime(b)), "blocks": buckets[b]}
        for b in keys
    ]
    return {"points": data}


@router.get("/era-history")
async def era_history():
    """Total staked per era (last 50 eras)."""
    con = _db()
    try:
        rows = con.execute(
            "SELECT era, total_stake FROM eras WHERE total_stake > 0 ORDER BY era DESC LIMIT 50"
        ).fetchall()
    finally:
        con.close()
    data = [
        {"era": r[0], "staked_pot": round(float(r[1]) / 1e14, 1)}
        for r in reversed(rows)
    ]
    return {"points": data}


@router.get("/validator-stake")
async def validator_stake():
    """Total stake per validator (POT)."""
    con = _db()
    try:
        rows = con.execute(
            """SELECT COALESCE(n.nickname, v.address), v.total_stake, v.commission
               FROM validators v LEFT JOIN validator_names n ON v.address = n.address
               ORDER BY v.total_stake DESC"""
        ).fetchall()
    finally:
        con.close()
    return {
        "validators": [
            {"name": r[0], "stake_pot": round(float(r[1]) / 1e14, 1), "commission": round(float(r[2]) / 1e7, 1)}
            for r in rows
        ]
    }
