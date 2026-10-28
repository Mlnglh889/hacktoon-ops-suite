"""Chain-derived payout history for a nominator.

Every field returned here is read from Portaldot V3 staking storage at a single
pinned block hash. There is no modelled or synthetic number: an era only appears
when the address is actually present in `Staking.ErasStakersPaged` for that era,
and the payout is computed with the same split the runtime uses:

    validator_payout = ErasValidatorReward[era] * points[validator] / total_points
    commission       = validator_payout * ErasValidatorPrefs[era][validator].commission
    nominator_pool   = validator_payout - commission
    nominator_reward = nominator_pool * nominator_stake / ErasStakersOverview[era][validator].total

Performance note: every read is pinned to one block hash. Unpinned reads make
substrate-interface fetch head + header + runtime version on each call (~1.4s);
pinned reads reuse the initialised runtime registry (~0.06s).
"""
import os
import threading
import time
from fastapi import APIRouter, HTTPException
from substrateinterface import SubstrateInterface
from substrateinterface.storage import StorageKey
from substrateinterface.storage import StorageKey

WS_URL = os.getenv("PORTALDOT_WS", "wss://test-node-v3.portaldot.dev")
PLANCK = 10 ** 14
PERBILL = 1_000_000_000
MAX_ERAS = 24
DEFAULT_ERAS = 8

router = APIRouter(prefix="/api/v3", tags=["v3-payouts"])

_SS = None
_SS_LOCK = threading.RLock()
_CACHE = {}
_CACHE_TTL = 45.0
_CACHE_LOCK = threading.RLock()
_CONSTANTS = {}
_CONSTANTS_LOCK = threading.RLock()


def _substrate():
    global _SS
    with _SS_LOCK:
        if _SS is None:
            # type_registry_preset='kusama' lets scalecodec reuse a typed registry
            # instead of inferring types per storage item.
            _SS = SubstrateInterface(url=WS_URL, ss58_format=42, type_registry_preset="kusama")
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


def _pin(ss):
    """Pin the connection to one block hash and initialise its runtime once.

    substrate-interface calls `init_runtime()` on every `query()` and
    `create_storage_key()`, and an unpinned init costs chain_getHead +
    chain_getHeader + state_getRuntimeVersion. Measured on this runtime: one
    payout build made 256 RPC calls (~18s) unpinned vs 8 calls (~0.9s) pinned.
    """
    block_hash = ss.get_chain_head()
    ss.init_runtime(block_hash=block_hash)
    return block_hash


def _storage_key(ss, item, params):
    """Build a StorageKey without the implicit `init_runtime()` round-trip."""
    return StorageKey.create_from_storage_function(
        "Staking", item, params, runtime_config=ss.runtime_config, metadata=ss.metadata
    )


def _pot(value):
    return None if value is None else int(value) / PLANCK


def _unwrap(value):
    """substrate-interface wraps many values in SingleValue containers."""
    if isinstance(value, dict) and "value" in value and len(value) == 1:
        return value["value"]
    return value


def _constant(ss, pallet, name, block_hash=None):
    """Runtime constant, cached per pallet.name (only changes on runtime upgrade)."""
    key = f"{pallet}.{name}"
    with _CONSTANTS_LOCK:
        if key in _CONSTANTS:
            return _CONSTANTS[key]
    try:
        raw = ss.get_constant(pallet, name, block_hash=block_hash)
        value = _unwrap(getattr(raw, "value", raw))
    except Exception:
        return None
    with _CONSTANTS_LOCK:
        _CONSTANTS[key] = value
    return value


def _era_duration_ms(ss, block_hash):
    """Era length from runtime constants: sessions/era x epoch blocks x block time.

    Verified on Portaldot V3: 6 x 600 x 6000 ms = 6h, which matches every
    historical `Staking.ActiveEra.start` probed (eras 53, 56, 59, 60 are exactly
    21,600,000 ms apart).
    """
    sessions = _constant(ss, "Staking", "SessionsPerEra", block_hash)
    epoch = _constant(ss, "Babe", "EpochDuration", block_hash)
    block_ms = _constant(ss, "Babe", "ExpectedBlockTime", block_hash)
    try:
        duration = int(sessions) * int(epoch) * int(block_ms)
    except (TypeError, ValueError):
        return None
    return duration if duration > 0 else None


def _era_starts(ss, eras, anchor_era, anchor_start, block_hash):
    """Era start timestamps from the chain's own ActiveEra anchor.

    `Staking.ActiveEra.start` is the chain record for the current era; earlier eras
    are that value offset by the runtime's era duration. If the anchor or the
    constants cannot be read the map stays empty and the UI shows no time rather
    than a guessed one.
    """
    duration = _era_duration_ms(ss, block_hash)
    if not duration or anchor_era is None or anchor_start is None:
        return {}
    return {era: anchor_start + (era - anchor_era) * duration for era in eras}


def _candidate_validators(ss, address, block_hash):
    """Validators worth probing: the session set plus the address' own targets."""
    candidates = set()
    try:
        for value in ss.query("Session", "Validators", [], block_hash=block_hash).value or []:
            candidates.add(str(_unwrap(value)))
    except Exception:
        pass
    try:
        nominations = ss.query("Staking", "Nominators", [address], block_hash=block_hash).value or {}
        for value in nominations.get("targets") or []:
            candidates.add(str(_unwrap(value)))
    except Exception:
        pass
    return sorted(candidates)


def _batch(ss, specs, block_hash):
    """One state_queryStorageAt round-trip for many storage keys."""
    if not specs:
        return {}
    keys = [_storage_key(ss, item, params) for _, _, item, params in specs]
    results = ss.query_multi(keys, block_hash=block_hash)
    bucket = {}
    for (era, validator, item, _), (_key, raw) in zip(specs, results):
        bucket.setdefault(era, {}).setdefault(validator, {})[item] = None if raw is None else raw.value
    return bucket


def _build(address, eras):
    ss = _substrate()
    block_hash = _pin(ss)

    current_era = _unwrap(ss.query("Staking", "CurrentEra", [], block_hash=block_hash).value)
    current_era = int(current_era)
    first_era = max(1, current_era - eras + 1)
    era_list = list(range(first_era, current_era + 1))

    active = ss.query("Staking", "ActiveEra", [], block_hash=block_hash).value or {}
    anchor_era = _unwrap(active.get("index"))
    anchor_start = _unwrap(active.get("start"))
    try:
        anchor_era = int(anchor_era)
        anchor_start = int(anchor_start)
    except (TypeError, ValueError):
        anchor_era = anchor_start = None

    validators = _candidate_validators(ss, address, block_hash)
    era_starts = _era_starts(ss, era_list, anchor_era, anchor_start, block_hash)

    try:
        payee_raw = ss.query("Staking", "Payee", [address], block_hash=block_hash).value
        payee = str(_unwrap(payee_raw)) if payee_raw is not None else None
    except Exception:
        payee = None

    empty = {
        "address": address,
        "current_era": current_era,
        "eras": era_list,
        "payee": payee,
        "rows": [],
        "era_starts": era_starts,
        "totals": {"reward_pot": 0.0, "claimed_pot": 0.0, "pending_pot": 0.0, "era_count": 0},
        "source": "Portaldot V3 staking storage (ErasValidatorReward, ErasRewardPoints, ErasStakersOverview, ErasStakersPaged, ErasValidatorPrefs, ClaimedRewards, Payee)",
        "block_number": None,
        "generated_at": int(time.time()),
    }
    if not validators:
        return empty

    # Batch 1: era reward/points plus per-validator overview, prefs and claim evidence.
    specs = []
    for era in era_list:
        specs.append((era, None, "ErasValidatorReward", [era]))
        specs.append((era, None, "ErasRewardPoints", [era]))
        for validator in validators:
            specs.append((era, validator, "ErasStakersOverview", [era, validator]))
            specs.append((era, validator, "ErasValidatorPrefs", [era, validator]))
            specs.append((era, validator, "ClaimedRewards", [era, validator]))
    bucket = _batch(ss, specs, block_hash)

    # Batch 2: nominator pages, only for eras/validators that actually have exposure.
    page_specs = []
    for era in era_list:
        for validator in validators:
            overview = bucket.get(era, {}).get(validator, {}).get("ErasStakersOverview") or {}
            page_count = int(_unwrap(overview.get("page_count")) or 0)
            for page in range(page_count):
                page_specs.append((era, validator, page))
    pages = {}
    if page_specs:
        keys = [_storage_key(ss, "ErasStakersPaged", [e, v, p]) for e, v, p in page_specs]
        for (era, validator, page), (_key, raw) in zip(page_specs, ss.query_multi(keys, block_hash=block_hash)):
            pages[(era, validator, page)] = None if raw is None else raw.value

    rows = []
    for era in era_list:
        era_entry = bucket.get(era, {}).get(None, {})
        era_reward = era_entry.get("ErasValidatorReward")
        points_data = era_entry.get("ErasRewardPoints") or {}
        total_points = int(_unwrap(points_data.get("total")) or 0)
        individual = {str(_unwrap(who)): int(_unwrap(pts)) for who, pts in (points_data.get("individual") or [])}
        for validator in validators:
            entry = bucket.get(era, {}).get(validator, {})
            overview = entry.get("ErasStakersOverview") or {}
            page_count = int(_unwrap(overview.get("page_count")) or 0)
            stake = None
            for page in range(page_count):
                paged = pages.get((era, validator, page)) or {}
                for other in paged.get("others") or []:
                    if str(_unwrap(other.get("who"))) == address:
                        stake = int(_unwrap(other.get("value")))
                        break
                if stake is not None:
                    break
            if stake is None:
                continue  # address not exposed to this validator in this era

            total_stake = int(_unwrap(overview.get("total")) or 0)
            validator_points = individual.get(validator, 0)
            prefs = entry.get("ErasValidatorPrefs") or {}
            commission_ratio = int(_unwrap(prefs.get("commission")) or 0) / PERBILL

            validator_payout = nominator_pool = reward = None
            if era_reward is not None and total_points > 0 and validator_points > 0:
                validator_payout = int(_unwrap(era_reward)) * validator_points / total_points
                nominator_pool = validator_payout * (1 - commission_ratio)
                if total_stake > 0:
                    reward = nominator_pool * stake / total_stake

            claimed_pages = entry.get("ClaimedRewards")
            claim_state = "claimed" if isinstance(claimed_pages, list) and claimed_pages else "unclaimed"

            rows.append({
                "era": era,
                "validator": validator,
                "stake_pot": _pot(stake),
                "validator_total_stake_pot": _pot(total_stake) if total_stake else None,
                "stake_share_pct": round(stake / total_stake * 100, 6) if total_stake else None,
                "era_reward_pot": _pot(era_reward),
                "validator_points": validator_points,
                "era_total_points": total_points,
                "validator_payout_pot": _pot(validator_payout) if validator_payout is not None else None,
                "commission_pct": round(commission_ratio * 100, 4),
                "nominator_pool_pot": _pot(nominator_pool) if nominator_pool is not None else None,
                "reward_pot": _pot(reward) if reward is not None else None,
                "claim_state": claim_state,
                "is_current_era": era == current_era,
                "era_start_ms": era_starts.get(era),
                "payee": payee,
            })

    if not rows:
        return {**empty, "block_number": None}

    paid = [row["reward_pot"] for row in rows if row["reward_pot"] is not None]
    claimed = sum(row["reward_pot"] for row in rows if row["claim_state"] == "claimed" and row["reward_pot"] is not None)
    pending = sum(row["reward_pot"] for row in rows if row["claim_state"] != "claimed" and row["reward_pot"] is not None)

    return {
        "address": address,
        "current_era": current_era,
        "eras": era_list,
        "payee": payee,
        "rows": rows,
        "era_starts": era_starts,
        "totals": {
            "reward_pot": sum(paid),
            "claimed_pot": claimed,
            "pending_pot": pending,
            "era_count": len({row["era"] for row in rows}),
        },
        "source": "Portaldot V3 staking storage (ErasValidatorReward, ErasRewardPoints, ErasStakersOverview, ErasStakersPaged, ErasValidatorPrefs, ClaimedRewards, Payee)",
        "generated_at": int(time.time()),
    }


def _cached(address, eras):
    with _CACHE_LOCK:
        hit = _CACHE.get((address, eras))
        if hit and time.monotonic() - hit[0] < _CACHE_TTL:
            return hit[1]
    return None


def _store(address, eras, payload):
    with _CACHE_LOCK:
        if len(_CACHE) > 64:
            _CACHE.clear()
        _CACHE[(address, eras)] = (time.monotonic(), payload)


@router.get("/payouts")
def payouts(address: str, eras: int = DEFAULT_ERAS):
    address = (address or "").strip()
    if len(address) < 32 or len(address) > 64:
        raise HTTPException(status_code=400, detail="A valid SS58 address is required")
    eras = max(1, min(MAX_ERAS, int(eras or DEFAULT_ERAS)))

    cached = _cached(address, eras)
    if cached is not None:
        return {**cached, "served_from": "cache", "stale": False}

    last_error = None
    for attempt in range(3):
        try:
            payload = _build(address, eras)
            _store(address, eras, payload)
            return {**payload, "served_from": "live", "stale": False}
        except Exception as error:  # websocket reset by the node -> reconnect and retry
            last_error = error
            with _CONSTANTS_LOCK:
                _CONSTANTS.clear()
            _reset_substrate()
            time.sleep(0.4 * (attempt + 1))

    # The RPC link can be reset for a few seconds (the snapshot collector shares the
    # node). Serving the last good reading with an explicit stale flag beats blanking
    # the table: the UI shows the value plus when it was captured.
    with _CACHE_LOCK:
        stale = _CACHE.get((address, eras))
    if stale is not None:
        return {**stale[1], "served_from": "cache", "stale": True, "error": str(last_error)}
    raise HTTPException(status_code=502, detail=f"Chain read failed: {last_error}")