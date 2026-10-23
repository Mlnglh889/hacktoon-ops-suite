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


@router.get("/overview")
def overview():
    ss, health, chain, header, block_number, block_hash, validators, era = _live_snapshot()
    total = 0
    if era is not None:
        with _SS_LOCK:
            for address in validators:
                try:
                    exposure = ss.query("Staking", "ErasStakers", [era, address]).value or {}
                    total += _int(exposure.get("total"), 0)
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


_VALIDATORS_CACHE = None
_VALIDATORS_CACHE_AT = 0.0
_VALIDATORS_TTL = 60.0


@router.get("/validators")
def validators():
    global _VALIDATORS_CACHE, _VALIDATORS_CACHE_AT
    if _VALIDATORS_CACHE is not None and time.monotonic() - _VALIDATORS_CACHE_AT < _VALIDATORS_TTL:
        return _VALIDATORS_CACHE
    result_payload = _validators_uncached()
    _VALIDATORS_CACHE, _VALIDATORS_CACHE_AT = result_payload, time.monotonic()
    return result_payload


def _validators_uncached():
    ss, _, chain, _, _, _, addresses, era = _live_snapshot()
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
                    exposure = ss.query("Staking", "ErasStakers", [era, address]).value or {}
                    total = _int(exposure.get("total"), 0)
                    own = _int(exposure.get("own"), 0)
                    nominator_count = len(exposure.get("others") or [])
                except Exception as exc:
                    errors.append(f"exposure: {exc}")
                try:
                    points_data = ss.query("Staking", "ErasRewardPoints", [era]).value or {}
                    individual = points_data.get("individual", {}) if isinstance(points_data, dict) else {}
                    points = _int(individual.get(address), 0)
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
    return {"network": chain or NETWORK, "validators": result}


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
