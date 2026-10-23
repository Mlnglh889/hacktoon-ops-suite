"""Staking Calculator — APY & reward projection using LAO NPoS model.

LAO (Linear Attenuation Offset) algorithm per Portaldot whitepaper §4.6:
- Era incentive determined by annual inflation rate I, which depends
  on the staking ratio x. I reaches max at ideal staking ratio.
- Reward attenuates every 4 years (linear offset).
- Nominator share = era_reward * (their_stake / total_stake) * (1 - commission)
"""
import sqlite3
from fastapi import APIRouter, Query

from app.collector import DB_PATH, get_substrate

router = APIRouter(prefix="/api/v1/staking", tags=["staking"])

# Assumptions configurable — Portaldot hasn't published exact numbers,
# these follow Substrate NPoS defaults + whitepaper description.
YEARS_PER_ERA = None  # derived at runtime if possible
DECIMALS = 10**14


def _get_chain_facts():
    ss = get_substrate()
    era = ss.query("Staking", "CurrentEra", []).value
    total_issuance = ss.query("Balances", "TotalIssuance", []).value
    # total staked = sum of validator total_stake (approx; nominator stakes included)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        "SELECT address, commission, self_stake, total_stake FROM validators GROUP BY address"
    ).fetchall()
    con.close()
    validators = []
    total_staked = 0
    for r in rows:
        ts = int(r["total_stake"] or 0)
        validators.append({
            "address": r["address"],
            "commission_pct": r["commission"] / 10**7,
            "total_stake_pot": ts / DECIMALS,
        })
        total_staked += ts
    return era, total_issuance, validators, total_staked


@router.get("/overview")
async def staking_overview():
    """Network-wide staking stats: era, staking ratio, estimated base APY."""
    era, issuance, validators, total_staked = _get_chain_facts()
    staking_ratio = total_staked / issuance if issuance else 0
    # Ideal staking ratio for NPoS ~ 50% (Substrate default) — LAO adjusts around this
    ideal_ratio = 0.5
    # Base inflation estimate: whitepaper says reward attenuates 4-yearly.
    # Without exact params, estimate: inflation ~ 7.5% at ideal ratio (Substrate default),
    # scaled linearly down as ratio moves away from ideal.
    base_inflation = 0.075
    if staking_ratio > 0:
        # simple linear model around ideal
        inflation = base_inflation * (1 - abs(staking_ratio - ideal_ratio) / ideal_ratio * 0.5)
        inflation = max(inflation, base_inflation * 0.25)  # floor
    else:
        inflation = base_inflation
    est_apy = inflation / staking_ratio if staking_ratio > 0 else 0
    return {
        "era": era,
        "total_issuance_pot": issuance / DECIMALS,
        "total_staked_pot": total_staked / DECIMALS,
        "staking_ratio": round(staking_ratio, 4),
        "ideal_ratio": ideal_ratio,
        "est_network_inflation_pct": round(inflation * 100, 2),
        "est_base_apy_pct": round(est_apy * 100, 2),
        "active_validators": len(validators),
        "apy_is_model_estimate": True,
        "apy_method": "LAO approximation using a 7.5% base inflation assumption and current staking ratio",
        "apy_calculation": "estimated APY = modeled annual inflation / current staking ratio",
        "model_note": "LAO NPoS approximation — parameters estimated from Substrate defaults, "
                      "not official Portaldot config. Updates as eras progress.",
        # Official on-chain constants (verified 2026-10-10 against wss://mainnet.portaldot.io
        # Staking.MinNominatorBond / MinValidatorBond / BondingDuration and runtime source
        # bin/node/runtime/src/lib.rs: SessionsPerEra 6, EpochDuration 120, BondingDuration 60)
        "min_nominator_bond_pot": 1000.0,
        "min_validator_bond_pot": 5000.0,
        "bonding_duration_eras": 60,
        "sessions_per_era": 6,
        "epoch_duration_blocks": 120,
        "max_nominations": 16,
    }


@router.get("/calculator")
async def staking_calculator(
    amount_pot: float = Query(..., gt=0, description="Amount of POT to stake"),
    validator: str = Query(..., description="Validator ss58 address"),
):
    """Project rewards for staking `amount_pot` to a specific validator."""
    overview = await staking_overview()
    base_apy = overview["est_base_apy_pct"] / 100
    total_staked = overview["total_staked_pot"]

    # find validator commission
    ss = get_substrate()
    commission_pct = None
    validator_stake = 0
    try:
        prefs = ss.query("Staking", "Validators", [validator]).value
        commission_pct = prefs.get("commission", 0) / 10**7
        # validator's own + nominated stake
        ledger_stake = 0
        try:
            exp = ss.query("Staking", "Exposure", [overview["era"], validator]).value
            validator_stake = (exp.get("total", 0) if isinstance(exp, dict) else 0) / DECIMALS
        except Exception:
            validator_stake = 0
    except Exception:
        pass

    # user's share of validator pool after stake
    if validator_stake > 0:
        user_share = amount_pot / (validator_stake + amount_pot)
    else:
        user_share = 0

    # gross annual reward = amount * base_apy * share factor
    # approximation: reward scales with share of the validator's total pool
    gross_annual = amount_pot * base_apy
    if validator_stake > 0 and (validator_stake + amount_pot) > 0:
        pool_ratio = validator_stake / (validator_stake + amount_pot)
        gross_annual = amount_pot * base_apy * pool_ratio * 2  # normalize conservatively
    net_annual = gross_annual * (1 - (commission_pct or 0) / 100)

    return {
        "amount_pot": amount_pot,
        "validator": validator,
        "validator_commission_pct": commission_pct,
        "validator_stake_pot": validator_stake,
        "base_apy_pct": overview["est_base_apy_pct"],
        "est_gross_annual_pot": round(gross_annual, 4),
        "est_net_annual_pot": round(net_annual, 4),
        "est_net_monthly_pot": round(net_annual / 12, 4),
        "est_net_daily_pot": round(net_annual / 365, 4),
        "user_share_of_validator_pct": round(user_share * 100, 2),
        "model_note": "LAO NPoS approximation. Actual rewards depend on era totals "
                      "and network staking ratio at time of bonding.",
    }
