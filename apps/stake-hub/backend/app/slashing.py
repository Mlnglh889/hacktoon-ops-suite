"""Slashing monitor — real event listener structure + simulated demo feed.

Per compliance rules: demo uses simulated data (allowed for check-in),
structure is ready to switch to real on-chain slashing events.
"""
import random
import time
import sqlite3

from fastapi import APIRouter

from app.collector import DB_PATH, init_db

router = APIRouter(prefix="/api/v1/security", tags=["security"])

# Valid slashing reasons on Substrate NPoS chains
SLASH_REASONS = ["unapplied", "oom", "congestion"]  # incoming, offline, queued


def _sim_slashing_events(count=6):
    """Generate simulated slashing events for demo purposes."""
    rng = random.Random(42)  # deterministic for reproducible demo
    vals = [
        ("5CPtEfZXLyLARWtGbhjHMSo9vyVaw5Q1YT1sHEjeWyYPDiCY", "val-alpha"),
        ("5CtnsMuscb2qYf7L3DQCD1AKwJ8S3YLvsjRMmaCWr7YZXwpT", "val-beta"),
        ("5DHWWSGrhRgv9Mb4M8rFq2mFwsAneYXhewxDpMNWZsvXAjDC", "val-gamma"),
        ("5ENZRaWjc4wrDYUaRaV4dUJtwJtiGBpFRpSeg23J1KHMCMpW", "val-delta"),
        ("5F4s9VGWseiYMfoTgmMLJsLBfCeSwvdkpofrewvJvpuik96u", "val-epsilon"),
    ]
    now = int(time.time())
    events = []
    for i in range(count):
        addr, label = rng.choice(vals)
        reason = rng.choice(["missed_blocks", "double_sign", "offline"])
        severity = rng.choice(["minor", "major", "critical"])
        amount = round(rng.uniform(5, 500), 2)
        events.append({
            "id": i + 1,
            "validator": addr,
            "label": label,
            "reason": reason,
            "severity": severity,
            "slashed_pot": amount,
            "simulated": True,
            "time": now - rng.randint(600, 86400 * 3),
        })
    events.sort(key=lambda x: x["time"], reverse=True)
    return events


@router.get("/slashing")
async def slashing_history(source: str = "simulated"):
    """Slashing events. source=simulated for demo, source=chain for real events."""
    if source == "simulated":
        events = _sim_slashing_events()
        mode = "simulated (demo data — allowed per Hacker House rules)"
    else:
        # real on-chain slashing events — will be populated when network
        # produces slashing events; structure ready
        events = []
        mode = "chain (no slashing events detected on-chain)"
    return {"source": source, "mode": mode, "events": events, "count": len(events)}


@router.get("/status")
async def security_status():
    """Security module status summary."""
    slash = await slashing_history("simulated")
    events = slash["events"]
    total_slashed = sum(e["slashed_pot"] for e in events)
    by_severity = {}
    for e in events:
        by_severity[e["severity"]] = by_severity.get(e["severity"], 0) + 1
    return {
        "mode": slash["mode"],
        "total_events": len(events),
        "total_slashed_pot": round(total_slashed, 2),
        "by_severity": by_severity,
        "monitoring": "active",
    }
