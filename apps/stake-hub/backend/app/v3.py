"""Portaldot V3 testnet read API used by the web dashboard."""
import os
import time
import threading
from fastapi import APIRouter
from substrateinterface import SubstrateInterface

WS_URL = os.getenv("PORTALDOT_WS", "wss://test-node-v3.portaldot.dev")

# substrate-interface lazily decodes runtime metadata. Keep one warmed connection
# and serialize access: concurrent first-use connections can race in scalecodec and
# produce the misleading `Compact<u32>` decoder error on this custom runtime.
_SS = None
_SS_LOCK = threading.RLock()
_SNAPSHOT_CACHE = None
_SNAPSHOT_CACHE_AT = 0.0
_SNAPSHOT_TTL = 8.0


def _invalidate_snapshot():
    global _SNAPSHOT_CACHE, _SNAPSHOT_CACHE_AT
    _SNAPSHOT_CACHE = None
    _SNAPSHOT_CACHE_AT = 0.0


def _cached_snapshot():
    if _SNAPSHOT_CACHE is not None and time.monotonic() - _SNAPSHOT_CACHE_AT < _SNAPSHOT_TTL:
        return _SNAPSHOT_CACHE
    return None


def _new_substrate():
    global _SS
    with _SS_LOCK:
        if _SS is None:
            _SS = SubstrateInterface(url=WS_URL, ss58_format=42, auto_discover=False)
        return _SS


def _reset_substrate():
    global _SS
    with _SS_LOCK:
        old, _SS = _SS, None
        if old is not None:
            try:
                old.close()
            except Exception:
                pass


def _call_snapshot():
    """Read a coherent live snapshot from one connection."""
    ss = _new_substrate()
    health = ss.rpc_request("system_health", []).get("result", {})
    chain = ss.rpc_request("system_chain", []).get("result")
    header = ss.rpc_request("chain_getHeader", []).get("result", {})
    block_number = _int(header.get("number"), 0)
    block_hash = ss.rpc_request("chain_getBlockHash", [header.get("number")]).get("result") if header.get("number") else None
    validators = ss.query("Session", "Validators", []).value or []
    era_raw = ss.query("Staking", "CurrentEra", []).value
    era = _int(era_raw, None) if era_raw is not None else None
    return ss, health, chain, header, block_number, block_hash, validators, era


from app.collector import get_substrate

router = APIRouter(prefix="/api/v3", tags=["v3-testnet"])
DECIMALS = 10**14
NETWORK = "PortaldotV3 Testnet"
CHAIN_ID = 420420777


def _int(value, default=0):
    try:
        if isinstance(value, str) and value.lower().startswith("0x"):
            return int(value, 16)
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_exposure(exposure):
    """Return (total, own, nominator_count) from Overview or legacy storage."""
    if not isinstance(exposure, dict):
        return 0, 0, 0
    total = _int(exposure.get("total"), 0)
    own = _int(exposure.get("own"), 0)
    nominators = exposure.get("nominator_count")
    if nominators is None:
        nominators = len(exposure.get("others") or [])
    return total, own, _int(nominators, 0)


def normalize_reward_points(points_data):
    """Return validator reward points from list or mapping storage shapes."""
    if not isinstance(points_data, dict):
        return {}
    individual = points_data.get("individual")
    if isinstance(individual, dict):
        return {str(address): _int(value, 0) for address, value in individual.items()}
    if isinstance(individual, list):
        result = {}
        for item in individual:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                result[str(item[0])] = _int(item[1], 0)
        return result
    return {}


def _live_snapshot():
    global _SNAPSHOT_CACHE, _SNAPSHOT_CACHE_AT
    cached = _cached_snapshot()
    if cached is not None:
        return cached
    last_error = None
    for attempt in range(2):
        try:
            with _SS_LOCK:
                snapshot = _call_snapshot()
            _SNAPSHOT_CACHE = snapshot
            _SNAPSHOT_CACHE_AT = time.monotonic()
            return snapshot
        except Exception as exc:
            last_error = exc
            _reset_substrate()
            _invalidate_snapshot()
            if attempt == 0:
                continue
    if last_error is not None:
        raise last_error
    raise RuntimeError("Unable to read live V3 snapshot")


def _overview_uncached():
    ss, health, chain, header, block_number, block_hash, validators, era = _live_snapshot()
    total = 0
    if era is not None:
        with _SS_LOCK:
            for address in validators:
                try:
                    exposure = ss.query("Staking", "ErasStakersOverview", [era, address]).value or {}
                    total += normalize_exposure(exposure)[0]
                except Exception:
                    continue
    return {
        "network": chain or NETWORK,
        "chain_id": CHAIN_ID,
        "latest_block": {"block_number": block_number, "block_hash": block_hash, "captured_at": int(time.time())},
        "latest_era": era,
        "validator_count": len(validators),
        "total_stake_pot": total / DECIMALS,
        "source": "Portaldot V3 live Substrate RPC",
        "health": {"is_syncing": health.get("isSyncing"), "peers": health.get("peers")},
    }


# validators endpoint: see _last_good_response below


def _validators_uncached():
    ss, _, chain, _, block_number, _, addresses, era = _live_snapshot()
    result = []
    with _SS_LOCK:
        for address in addresses:
            commission = None
            total = None
            own = None
            nominator_count = None
            points = None
            errors = []
            try:
                prefs = ss.query("Staking", "ErasValidatorPrefs", [era, address]).value or {}
                commission = _int(prefs.get("commission"), 0) / 10**7
            except Exception as exc:
                errors.append(f"commission: {exc}")
            if era is not None:
                try:
                    exposure = ss.query("Staking", "ErasStakersOverview", [era, address]).value or {}
                    total, own, nominator_count = normalize_exposure(exposure)
                except Exception as exc:
                    errors.append(f"exposure: {exc}")
                try:
                    points_data = ss.query("Staking", "ErasRewardPoints", [era]).value or {}
                    individual = normalize_reward_points(points_data)
                    points = individual.get(address, 0)
                except Exception as exc:
                    errors.append(f"points: {exc}")
            else:
                errors.append("exposure: current era unavailable")
            result.append({
                "address": address,
                "nickname": None,
                "last_seen": int(time.time()),
                "era": era,
                "total_pot": None if total is None else str(total / DECIMALS),
                "own_pot": None if own is None else str(own / DECIMALS),
                "nominator_count": nominator_count,
                "commission_pct": None if commission is None else str(commission),
                "points": points,
                "data_errors": errors,
            })
    return {"network": chain or NETWORK, "validators": result, "block_number": block_number}


@router.get("/eras/latest")
def latest_era():
    data = overview()
    return {
        "era": data["latest_era"],
        "validator_count": data["validator_count"],
        "total_stake_pot": data["total_stake_pot"],
        "captured_at": data["latest_block"]["captured_at"],
    }


@router.get("/health")
def v3_health():
    _, health, chain, _, block_number, block_hash, _, era = _live_snapshot()
    return {"network": chain or NETWORK, "chain_id": CHAIN_ID, "block_number": block_number, "block_hash": block_hash, "era": era, "health": health}


@router.get("/heartbeat/latest")
def heartbeat_latest():
    return {"status": "pending", "message": "No finalized heartbeat evidence has been recorded yet."}


_NETWORK_CACHE = None
_NETWORK_CACHE_AT = 0.0
_NETWORK_TTL = 60.0


@router.get("/network")
def network_stats():
    """Read-only network figures straight from chain storage: total issuance, era total stake, staking ratio. Cached 60s."""
    global _NETWORK_CACHE, _NETWORK_CACHE_AT
    if _NETWORK_CACHE is not None and time.monotonic() - _NETWORK_CACHE_AT < _NETWORK_TTL:
        return _NETWORK_CACHE
    ss, _, chain, _, block_number, block_hash, _, era = _live_snapshot()
    with _SS_LOCK:
        issuance = _int(ss.query("Balances", "TotalIssuance", []).value, 0)
        era_total = _int(ss.query("Staking", "ErasTotalStake", [era]).value, 0) if era is not None else 0
    ratio = (era_total / issuance * 100) if issuance else 0.0
    result = {
        "network": chain or NETWORK,
        "era": era,
        "block_number": block_number,
        "total_issuance_pot": issuance / DECIMALS,
        "total_staked_pot": era_total / DECIMALS,
        "staking_ratio_pct": round(ratio, 4),
        "source": "Portaldot V3 live Substrate RPC",
    }
    _NETWORK_CACHE, _NETWORK_CACHE_AT = result, time.monotonic()
    return result


# ---------------------------------------------------------------------------
# Last-good responses for /validators and /overview.
# - Each read runs in a worker with a hard timeout (V3_RPC_TIMEOUT seconds).
# - Concurrent callers share one in-flight RPC read (no duplicate RPC storms).
# - On success the payload is stored with cachedAt + blockNumber.
# - On timeout/error, the last good payload is returned with stale=true.
#   It is never presented as live (served_from="cache").
# - With no cached payload, the endpoint answers 503 instead of inventing data.
# ---------------------------------------------------------------------------
import concurrent.futures
from fastapi import HTTPException

V3_RPC_TIMEOUT = float(os.getenv("V3_RPC_TIMEOUT", "20"))  # cold RPC start measured ~15s
V3_VALIDATORS_TTL = float(os.getenv("V3_VALIDATORS_TTL", "60"))
V3_OVERVIEW_TTL = float(os.getenv("V3_OVERVIEW_TTL", "60"))
_RPC_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="v3-rpc")
_INFLIGHT = {}
_INFLIGHT_LOCK = threading.Lock()
_LAST_GOOD = {}  # key -> {"mono", "cached_at", "block_number", "payload"}


def _run_deduped(key, fn):
    """Run fn in a worker; concurrent callers with the same key share one future."""
    with _INFLIGHT_LOCK:
        fut = _INFLIGHT.get(key)
        if fut is None or fut.done():
            fut = _RPC_POOL.submit(fn)
            _INFLIGHT[key] = fut
    return fut.result(timeout=V3_RPC_TIMEOUT)


def _respond(key, fn, ttl):
    entry = _LAST_GOOD.get(key)
    if entry is not None and time.monotonic() - entry["mono"] < ttl:
        return _live_body(entry)  # fetched from RPC within TTL; cachedAt = fetch time
    try:
        payload = _run_deduped(key, fn)
    except Exception as exc:  # timeout, RPC error, decode error
        if isinstance(exc, concurrent.futures.TimeoutError):
            error = f"RPC timeout after {V3_RPC_TIMEOUT:g}s"
        else:
            error = f"{type(exc).__name__}: {exc}"[:200]
        if entry is not None:
            return _cached_body(entry, stale=True, error=error)
        raise HTTPException(status_code=503, detail={"error": error, "stale": True, "served_from": None})
    entry = {
        "mono": time.monotonic(),
        "cached_at": int(time.time()),
        "block_number": _block_of(payload),
        "payload": payload,
    }
    _LAST_GOOD[key] = entry
    return _live_body(entry)


def _block_of(payload):
    if not isinstance(payload, dict):
        return None
    if payload.get("block_number") is not None:
        return payload.get("block_number")
    return (payload.get("latest_block") or {}).get("block_number")


def _live_body(entry):
    body = dict(entry["payload"])
    body.update({"served_from": "live", "stale": False, "cachedAt": entry["cached_at"],
                 "blockNumber": entry["block_number"], "error": None})
    return body


def _cached_body(entry, stale, error):
    body = dict(entry["payload"])
    body.update({"served_from": "cache", "stale": stale, "cachedAt": entry["cached_at"],
                 "blockNumber": entry["block_number"], "error": error})
    return body


@router.get("/validators")
def validators():
    return _respond("validators", lambda: _validators_uncached(), V3_VALIDATORS_TTL)


@router.get("/overview")
def overview():
    return _respond("overview", lambda: _overview_uncached(), V3_OVERVIEW_TTL)


@router.get("/infra/rpc")
def infra_rpc(window: str = "latest"):
    from app.rpc_health import report
    return report(window if window in {"latest", "1h", "24h", "7d"} else "latest")


@router.get("/telegram/status")
def telegram_status():
    """Delivery status read from the Telegram worker's own state, not from the UI."""
    from app.telegram_alerts import status_snapshot
    return status_snapshot()


@router.get("/incidents")
def infra_incidents(window: str = "24h"):
    """Incident timeline derived only from persisted snapshots and probe samples."""
    import json
    from app import incidents as inc
    from app.v3_snapshots import _con as snapshot_con
    from app import rpc_health

    window_seconds = {"1h": 3600, "24h": 86400, "7d": 604800}.get(window, 86400)
    since = int(__import__("time").time()) - window_seconds

    changes = []
    snapshot_id = None
    with snapshot_con() as con:
        row = con.execute("SELECT id FROM v3_snapshots ORDER BY id DESC LIMIT 1").fetchone()
        if row:
            snapshot_id = row["id"]
        for change in con.execute(
            "SELECT detected_at, snapshot_id, address, field, old_value, new_value FROM v3_changes"
            " WHERE detected_at >= ? ORDER BY detected_at DESC LIMIT 5000",
            (since,),
        ):
            changes.append({
                "detected_at": change["detected_at"], "snapshot_id": change["snapshot_id"],
                "address": change["address"], "field": change["field"],
                "old": change["old_value"], "new": change["new_value"],
            })

    rpc_reports = []
    for family, endpoint in (("substrate", rpc_health.endpoints()[0]), ("evm", rpc_health.endpoints()[-1])):
        history = rpc_health._history(endpoint, since)
        rpc_reports.append({
            "endpoint": endpoint, "chain_family": family,
            "samples": history["samples"], "block_progress": history["block_progress"],
            "slow_ms": rpc_health.SLOW_MS, "degraded_ms": rpc_health.DEGRADED_MS,
        })

    result = inc.collect(validator_changes=changes, rpc_reports=rpc_reports)
    result["window"] = window
    result["window_seconds"] = window_seconds
    result["since"] = since
    result["sources"] = {
        "validator_changes": {"rows": len(changes), "latest_snapshot_id": snapshot_id,
                              "source": "v3_snapshots.db v3_changes"},
        "rpc_samples": {"count": sum(len(r["samples"]) for r in rpc_reports),
                        "source": "rpc_health.db rpc_samples"},
    }
    return result
