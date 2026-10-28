"""Payout history math and route contract.

The reward split is the part that must never drift: if this math is wrong the UI
shows a number that a nominator cannot reconcile with the chain. These tests pin
the exact formula used by the runtime.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import payouts  # noqa: E402


def test_reward_split_matches_runtime_formula():
    """validator payout -> commission -> nominator share of the pool."""
    era_reward = 347_319_977_698_707          # ErasValidatorReward[59], planck
    validator_points = 36_400
    total_points = 71_740
    commission_ratio = 0.01                    # ErasValidatorPrefs commission 10_000_000 perbill
    nominator_stake = 198_691_476_872_328      # ErasStakersPaged entry for the wallet
    total_stake = 1_011_140_602_225_948_584        # ErasStakersOverview.total

    validator_payout = era_reward * validator_points / total_points
    nominator_pool = validator_payout * (1 - commission_ratio)
    reward = nominator_pool * nominator_stake / total_stake

    # Cross-checked against a live chain read on 2026-10-27 (era 59, validator 5Grj5uKA…).
    assert round(validator_payout / payouts.PLANCK, 6) == 1.762259
    assert round(reward / payouts.PLANCK, 12) == 0.000342825137


def test_unwrap_single_value_containers():
    assert payouts._unwrap({"value": 7}) == 7
    assert payouts._unwrap({"value": 7, "other": 1}) == {"value": 7, "other": 1}
    assert payouts._unwrap(7) == 7
    assert payouts._unwrap("abc") == "abc"


def test_pot_conversion_uses_fourteen_decimals():
    assert payouts._pot(10 ** 14) == 1.0
    assert payouts._pot(1_989_089_250_000_000) == 19.8908925
    assert payouts._pot(None) is None


def test_era_starts_are_derived_from_chain_anchor(monkeypatch):
    """Historical era starts must offset from ActiveEra.start, never be invented."""
    class FakeSS:
        def get_constant(self, pallet, name, block_hash=None):
            return {"SessionsPerEra": 6, "EpochDuration": 600, "ExpectedBlockTime": 6000}.get(name)

    monkeypatch.setattr(payouts, "_CONSTANTS", {})
    starts = payouts._era_starts(FakeSS(), [58, 59, 60], 60, 1_793_087_646_000, "0xabc")

    assert starts[60] == 1_793_087_646_000
    assert starts[59] == 1_793_087_646_000 - 21_600_000
    assert starts[58] == 1_793_087_646_000 - 43_200_000


def test_era_starts_empty_when_anchor_missing(monkeypatch):
    """No anchor means no timestamps — the UI must show nothing rather than guess."""
    class FakeSS:
        def get_constant(self, pallet, name, block_hash=None):
            return None

    monkeypatch.setattr(payouts, "_CONSTANTS", {})
    assert payouts._era_starts(FakeSS(), [58, 59], None, None, "0xabc") == {}


def test_payouts_rejects_invalid_address():
    from fastapi import HTTPException

    try:
        payouts.payouts(address="too-short", eras=8)
    except HTTPException as error:
        assert error.status_code == 400
    else:  # pragma: no cover
        raise AssertionError("invalid SS58 address must be rejected")


def test_stale_cache_is_served_instead_of_blanking(monkeypatch):
    """A reset RPC link must degrade to the last good reading, flagged stale."""
    def boom(address, eras):
        raise RuntimeError("Connection reset by peer")

    monkeypatch.setattr(payouts, "_CACHE", {})
    monkeypatch.setattr(payouts, "_reset_substrate", lambda: None)
    monkeypatch.setattr(payouts, "time", payouts.time)

    good = {"address": "5" * 48, "rows": [{"era": 59}], "eras": [59], "era_starts": {}, "totals": {"era_count": 1}}
    payouts._store("5" * 48, 8, good)
    # Age the entry past the fresh-TTL so the retry path runs and then falls back.
    with payouts._CACHE_LOCK:
        payouts._CACHE[("5" * 48, 8)] = (payouts.time.monotonic() - payouts._CACHE_TTL - 1, good)
    monkeypatch.setattr(payouts, "_build", boom)

    body = payouts.payouts(address="5" * 48, eras=8)
    assert body["served_from"] == "cache"
    assert body["stale"] is True
    assert body["rows"] == [{"era": 59}]


def test_no_cache_and_failing_chain_raises_502(monkeypatch):
    from fastapi import HTTPException

    def boom(address, eras):
        raise RuntimeError("Connection reset by peer")

    monkeypatch.setattr(payouts, "_CACHE", {})
    monkeypatch.setattr(payouts, "_reset_substrate", lambda: None)
    monkeypatch.setattr(payouts, "_build", boom)

    try:
        payouts.payouts(address="5" * 48, eras=3)
    except HTTPException as error:
        assert error.status_code == 502
    else:  # pragma: no cover
        raise AssertionError("a failing chain read with no cache must surface 502")


def test_eras_are_clamped_to_supported_window(monkeypatch):
    calls = {}

    def fake_build(address, eras):
        calls["eras"] = eras
        return {"address": address, "rows": [], "eras": [], "era_starts": {}, "totals": {}}

    monkeypatch.setattr(payouts, "_build", fake_build)
    monkeypatch.setattr(payouts, "_CACHE", {})

    payouts.payouts(address="5" * 48, eras=999)
    assert calls["eras"] == payouts.MAX_ERAS

    payouts.payouts(address="5" * 48, eras=0)
    assert calls["eras"] == payouts.DEFAULT_ERAS