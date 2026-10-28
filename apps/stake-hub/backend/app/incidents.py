"""Incident rules: derive alerts from data already stored, never invent events.

Sources are only the two persisted stores:
- v3_snapshots / v3_changes (validator membership, commission, stake, nominators)
- rpc_samples (probe latency, failures, block freshness)

Every incident carries the evidence that produced it (snapshot id, address, field,
sample timestamp) so the UI can link back to real data. Rules are pure functions
over plain dicts so they are testable without a database.
"""
import time

SEVERITIES = ("critical", "warning", "info")

# Default thresholds; overridable from env by the caller.
COMMISSION_JUMP_PCT = 1.0        # percentage points in one snapshot step
STALE_PROBE_SECONDS = 180        # no fresh sample for this long
RPC_SLOW_STREAK = 3              # consecutive slow samples
RPC_DEGRADED_STREAK = 2          # consecutive degraded samples
RPC_FAILURE_STREAK = 1           # consecutive failed samples


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def commission_change_incidents(changes):
    """Commission moves above the threshold. Warning; critical on a huge jump."""
    out = []
    for change in changes:
        if change.get("field") != "commission_pct":
            continue
        old, new = _num(change.get("old")), _num(change.get("new"))
        if old is None or new is None:
            continue
        delta = new - old
        if abs(delta) < COMMISSION_JUMP_PCT:
            continue
        out.append({
            "kind": "commission_change",
            "severity": "critical" if abs(delta) >= 5.0 else "warning",
            "address": change.get("address"),
            "title": f"Commission {'up' if delta > 0 else 'down'} {abs(delta):.2f} pp",
            "detail": f"{old:.2f}% -> {new:.2f}%",
            "evidence": {"field": "commission_pct", "old": change.get("old"), "new": change.get("new")},
        })
    return out


def membership_incidents(changes):
    """Validator set membership changes."""
    out = []
    for change in changes:
        if change.get("field") != "membership":
            continue
        added = change.get("new") == "added"
        out.append({
            "kind": "membership_change",
            "severity": "info",
            "address": change.get("address"),
            "title": "Validator joined active set" if added else "Validator left active set",
            "detail": change.get("new") or "",
            "evidence": {"field": "membership", "old": change.get("old"), "new": change.get("new")},
        })
    return out


def stake_change_incidents(changes, min_pct=1.0):
    """Total stake moves by at least min_pct percent."""
    out = []
    for change in changes:
        if change.get("field") != "total_pot":
            continue
        old, new = _num(change.get("old")), _num(change.get("new"))
        if not old or new is None:
            continue
        pct = (new - old) / old * 100.0
        if abs(pct) < min_pct:
            continue
        out.append({
            "kind": "stake_change",
            "severity": "warning" if pct < 0 else "info",
            "address": change.get("address"),
            "title": f"Total stake {'down' if pct < 0 else 'up'} {abs(pct):.2f}%",
            "detail": f"{pct:+.2f}% since previous snapshot",
            "evidence": {"field": "total_pot", "old": change.get("old"), "new": change.get("new")},
        })
    return out


def nominator_change_incidents(changes):
    """Nominator count changes."""
    out = []
    for change in changes:
        if change.get("field") != "nominator_count":
            continue
        old, new = _num(change.get("old")), _num(change.get("new"))
        if old is None or new is None or old == new:
            continue
        out.append({
            "kind": "nominator_change",
            "severity": "info",
            "address": change.get("address"),
            "title": f"Nominators {int(new - old):+d}",
            "detail": f"{int(old)} -> {int(new)}",
            "evidence": {"field": "nominator_count", "old": change.get("old"), "new": change.get("new")},
        })
    return out


def _streak(samples, predicate):
    """Length of the trailing run of samples matching predicate (samples oldest->newest)."""
    count = 0
    for sample in reversed(samples):
        if predicate(sample):
            count += 1
        else:
            break
    return count


def rpc_incidents(endpoint, family, samples, slow_ms, degraded_ms, now=None):
    """Latency and failure incidents from persisted probe samples (oldest -> newest)."""
    now = now or int(time.time())
    out = []
    if not samples:
        return out

    latest = samples[-1]
    failed = _streak(samples, lambda s: not s.get("ok"))
    if failed >= RPC_FAILURE_STREAK:
        kind = latest.get("failure_kind") or "unknown"
        # Backend failures are not endpoint outages and must be labelled separately.
        backend = kind == "internal"
        out.append({
            "kind": "rpc_backend_failure" if backend else "rpc_endpoint_failure",
            "severity": "critical" if not backend else "warning",
            "address": None,
            "title": (f"{family} probe failing" if not backend else f"{family} backend probe error"),
            "detail": f"{failed} consecutive failed probe(s), last kind: {kind}",
            "evidence": {"endpoint": endpoint, "failure_kind": kind, "since": latest.get("checked_at")},
        })

    def lat(s):
        return s.get("latency_ms")

    degraded = _streak(samples, lambda s: s.get("ok") and (lat(s) or 0) > degraded_ms)
    if degraded >= RPC_DEGRADED_STREAK:
        out.append({
            "kind": "rpc_degraded",
            "severity": "warning",
            "address": None,
            "title": f"{family} latency degraded",
            "detail": f"{degraded} consecutive probes above {degraded_ms} ms",
            "evidence": {"endpoint": endpoint, "threshold_ms": degraded_ms, "latest_ms": lat(latest)},
        })
    else:
        slow = _streak(samples, lambda s: s.get("ok") and (lat(s) or 0) >= slow_ms)
        if slow >= RPC_SLOW_STREAK:
            out.append({
                "kind": "rpc_slow",
                "severity": "info",
                "address": None,
                "title": f"{family} latency slow",
                "detail": f"{slow} consecutive probes at or above {slow_ms} ms",
                "evidence": {"endpoint": endpoint, "threshold_ms": slow_ms, "latest_ms": lat(latest)},
            })

    stale_for = now - int(latest.get("checked_at") or now)
    if stale_for > STALE_PROBE_SECONDS:
        out.append({
            "kind": "rpc_stale",
            "severity": "warning",
            "address": None,
            "title": f"{family} probe data stale",
            "detail": f"No new sample for {stale_for} s",
            "evidence": {"endpoint": endpoint, "last_sample": latest.get("checked_at")},
        })
    return out


def block_lag_incident(family, block_progress, now=None, max_stale_seconds=120):
    """Block head stopped advancing for this chain, judged only against its own history."""
    now = now or int(time.time())
    if not block_progress:
        return []
    stale = block_progress.get("stale_for_seconds")
    if stale is None or stale <= max_stale_seconds:
        return []
    return [{
        "kind": "block_head_stalled",
        "severity": "warning",
        "address": None,
        "title": f"{family} head not advancing",
        "detail": f"No new block observed for {stale} s (own-chain reference only)",
        "evidence": {"family": family, "last_block": block_progress.get("last_block"), "stale_for_seconds": stale},
    }]


def collect(validator_changes=None, rpc_reports=None, now=None):
    """Merge all rules into one timeline, newest evidence first."""
    now = now or int(time.time())
    incidents = []
    changes = validator_changes or []
    incidents += commission_change_incidents(changes)
    incidents += membership_incidents(changes)
    incidents += stake_change_incidents(changes)
    incidents += nominator_change_incidents(changes)
    for report in rpc_reports or []:
        incidents += rpc_incidents(
            report["endpoint"], report["chain_family"], report.get("samples") or [],
            report.get("slow_ms", 1000), report.get("degraded_ms", 3000), now=now,
        )
        incidents += block_lag_incident(report["chain_family"], report.get("block_progress"), now=now)
    # Deterministic order: severity first, then kind, then address.
    order = {s: i for i, s in enumerate(SEVERITIES)}
    incidents.sort(key=lambda i: (order.get(i["severity"], 9), i["kind"], str(i.get("address") or "")))
    return {"incidents": incidents, "count": len(incidents), "generated_at": now,
            "by_severity": {s: sum(1 for i in incidents if i["severity"] == s) for s in SEVERITIES}}
