"""Portaldot Stake Hub — Backend entry point."""
import os
import sys
import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(__file__))

from app.charts import router as charts_router

app = FastAPI(
    title="Portaldot Stake Hub API",
    description="Monitoring & staking tooling for Portaldot Network",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.collector import init_db, DB_PATH, get_substrate
from app.security import compute_risk_score
from app.names import get_validator_name, ensure_table as ensure_names_table
from app.staking import router as staking_router
from app.security import router as security_router
from app.slashing import router as slashing_router
from app.v3 import router as v3_router

app.include_router(staking_router)
app.include_router(security_router)
app.include_router(slashing_router)
app.include_router(v3_router)


def _active_validator_set():
    """Return the live Session validator set, or None if it cannot be verified."""
    try:
        values = get_substrate().query("Session", "Validators", []).value
        return {str(address) for address in values}
    except Exception:
        return None


def _current_chain_era():
    """Return the live chain era, or None if RPC verification is unavailable."""
    try:
        value = get_substrate().query("Staking", "CurrentEra", []).value
        return int(value) if value is not None else None
    except Exception:
        return None


@app.get("/")
async def root():
    return {"app": "portaldot-stake-hub", "version": "0.1.0", "status": "ok"}


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}


@app.get("/api/v1/stats")
async def stats():
    init_db()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    block = con.execute("SELECT number FROM blocks ORDER BY number DESC LIMIT 1").fetchone()
    era = con.execute("SELECT era FROM eras ORDER BY era DESC LIMIT 1").fetchone()
    vcount = con.execute("SELECT COUNT(DISTINCT address) FROM validators").fetchone()[0]
    ts = con.execute("SELECT total_stake FROM eras ORDER BY era DESC LIMIT 1").fetchone()
    con.close()
    active_set = _active_validator_set()
    current_era = _current_chain_era()
    return {
        "block_height": block["number"] if block else None,
        "era": current_era if current_era is not None else (era["era"] if era else None),
        "validators": vcount,
        "active_validator_count": len(active_set) if active_set is not None else None,
        "validators_status_verified": active_set is not None,
        "total_staked_pot": float(ts[0]) if ts else 0,
        "staking_ratio_pct": round(float(ts[0]) / 1.0166837006926831e23 * 100, 2) if ts and ts[0] else 0,
    }


@app.get("/api/v1/validators")
async def validators():
    init_db()
    ensure_names_table()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT address, commission, total_stake, last_seen FROM validators v WHERE last_seen = (SELECT MAX(last_seen) FROM validators v2 WHERE v2.address = v.address) ORDER BY total_stake DESC"
    ).fetchall()
    con.close()
    active_set = _active_validator_set()
    from app.security import compute_risk_score
    total_all = sum(float(dict(r).get("total_stake") or 0) for r in rows) / 1e14
    out = []
    for r in rows:
        address = r["address"]
        stake_pot = float(dict(r).get("total_stake") or 0) / 1e14
        v = {
            "address": address,
            "commission_pct": r["commission"] / 10**7,
            "total_stake_pot": stake_pot,
            "stake_share_pct": round(stake_pot / total_all * 100, 2) if total_all else 0,
        }
        risk = compute_risk_score(v)
        status = "Unknown" if active_set is None else ("Active" if address in active_set else "Inactive")
        out.append({
            "address": address,
            "name": get_validator_name(address),
            "commission": r["commission"] / 10**7,
            "total_stake_pot": stake_pot,
            "status": status,
            "status_source": "Session.Validators" if active_set is not None else None,
            "tier": risk["tier"],
            "risk_score": risk["risk_score"],
        })
    out.sort(key=lambda x: x["total_stake_pot"], reverse=True)
    return {"validators": out}


# ---------- Dot AI assistant (Gemini-grounded) ----------
from fastapi import Body
from app.ai_dot import _gather_context, _ask_gemini

@app.post("/api/v1/ai/chat")
def dot_chat(payload: dict = Body(...)):
    message = (payload.get("message") or "").strip()
    if not message:
        return {"reply": "Ask me anything about Portaldot staking 🙂"}
    context = _gather_context()
    reply = None
    try:
        reply = _ask_gemini(message, context)
    except Exception:
        reply = None
    if not reply:
        reply = ("I could not reach my brain service just now — but the Dashboard "
                 "below still shows live numbers. Try me again in a moment.")
    return {"reply": reply}

app.include_router(charts_router)
