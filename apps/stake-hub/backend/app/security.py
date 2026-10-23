"""Security tools — risk scoring, slashing monitor, anomaly detection.

Real data where available (RPC), simulated feed for demo of
slashing events (switchable to on-chain events when they occur).
"""
import random
import time
import sqlite3

from fastapi import APIRouter

from app.collector import DB_PATH, get_substrate, init_db

router = APIRouter(prefix="/api/v1/security", tags=["security"])

DECIMALS = 10**14


def _validators_snapshot():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """SELECT v.address, v.commission, v.total_stake, v.last_seen,
                  (SELECT MAX(era) FROM eras) as era
           FROM validators v
           WHERE v.last_seen = (SELECT MAX(last_seen) FROM validators v2 WHERE v2.address = v.address)"""
    ).fetchall()
    con.close()
    total = sum(int(dict(r).get("total_stake") or 0) for r in rows) / DECIMALS
    out = []
    for r in rows:
        d = dict(r)
        stake = int(d.get("total_stake") or 0) / DECIMALS
        out.append({
            "address": d["address"],
            "commission_pct": d["commission"] / 10**7,
            "total_stake_pot": stake,
            "stake_share_pct": round(stake / total * 100, 2) if total else 0,
        })
    return out, total


def compute_risk_score(v):
    """Composite risk score 0 (safest) to 100 (riskiest).

    Factors:
    - commission: 100% = nominator gets nothing = red flag (0-40 pts)
    - stake dominance: too-large validator = centralization risk (0-30 pts)
    - unknown/short history: shorter track record = more uncertainty (0-20 pts)
    - commission changes: spikes indicate opportunistic behaviour (0-10 pts)
    """
    score = 0
    notes = []

    # 1. commission risk (0-40)
    c = v["commission_pct"]
    if c >= 100:
        score += 40
        notes.append("100% commission — nominators receive no rewards")
    elif c >= 50:
        score += 30
        notes.append(f"high commission {c}%")
    elif c >= 30:
        score += 12
        notes.append(f"moderate commission {c}%")
    else:
        score += 5

    # 2. stake dominance (0-30)
    share = v["stake_share_pct"]
    if share >= 25:
        score += 30
        notes.append(f"controls {share}% of network stake — centralization risk")
    elif share >= 15:
        score += 20
        notes.append(f"large stake share {share}%")
    elif share >= 8:
        score += 10
    else:
        score += 2

    # 3. history depth (0-20) — era-based approximation
    # (placeholder: treat all equally until we track history over time)
    score += 10
    notes.append("history tracking in progress")

    # 4. commission stability (0-10) — placeholder until era history exists
    score += 5

    tier = "SAFE" if score < 35 else ("WATCH" if score < 60 else "RISKY")
    return {"risk_score": min(score, 100), "tier": tier, "notes": notes}


@router.get("/risk-report")
async def risk_report():
    """Composite risk report for all active validators (real data)."""
    vals, total = _validators_snapshot()
    report = []
    for v in vals:
        risk = compute_risk_score(v)
        report.append({**v, **risk})
    report.sort(key=lambda x: x["risk_score"])
    safe = sum(1 for r in report if r["tier"] == "SAFE")
    watch = sum(1 for r in report if r["tier"] == "WATCH")
    risky = sum(1 for r in report if r["tier"] == "RISKY")
    return {
        "generated_at": int(time.time()),
        "validators": report,
        "summary": {"safe": safe, "watch": watch, "risky": risky, "total": len(report)},
    }
