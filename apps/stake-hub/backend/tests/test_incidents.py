"""Tests for incident rules. Pure logic over stored data; no chain access."""
import app.incidents as inc


def _s(ts, latency=None, ok=True, kind=None):
    return {"checked_at": ts, "latency_ms": latency, "ok": ok, "failure_kind": kind}


def test_commission_jump_above_threshold_is_warning():
    out = inc.commission_change_incidents([
        {"address": "A", "field": "commission_pct", "old": "10.00", "new": "12.50"},
    ])
    assert len(out) == 1
    assert out[0]["severity"] == "warning"
    assert "2.50 pp" in out[0]["title"]
    assert out[0]["evidence"]["new"] == "12.50"


def test_commission_huge_jump_is_critical():
    out = inc.commission_change_incidents([
        {"address": "A", "field": "commission_pct", "old": "10.00", "new": "30.00"},
    ])
    assert out[0]["severity"] == "critical"


def test_small_commission_move_is_ignored():
    out = inc.commission_change_incidents([
        {"address": "A", "field": "commission_pct", "old": "10.00", "new": "10.50"},
    ])
    assert out == []


def test_membership_added_and_removed():
    out = inc.membership_incidents([
        {"address": "A", "field": "membership", "old": None, "new": "added"},
        {"address": "B", "field": "membership", "old": "present", "new": "removed"},
    ])
    assert len(out) == 2
    assert {i["title"] for i in out} == {"Validator joined active set", "Validator left active set"}


def test_stake_drop_is_warning_and_growth_is_info():
    out = inc.stake_change_incidents([
        {"address": "A", "field": "total_pot", "old": "1000", "new": "900"},
        {"address": "B", "field": "total_pot", "old": "1000", "new": "1200"},
    ])
    assert [i["severity"] for i in out] == ["warning", "info"]


def test_rpc_endpoint_failure_is_critical_but_backend_failure_is_not():
    endpoint = inc.rpc_incidents("wss://e", "substrate", [_s(1, None, False, "transport")], 1000, 3000)
    backend = inc.rpc_incidents("wss://e", "substrate", [_s(1, None, False, "internal")], 1000, 3000)
    assert endpoint[0]["kind"] == "rpc_endpoint_failure" and endpoint[0]["severity"] == "critical"
    assert backend[0]["kind"] == "rpc_backend_failure" and backend[0]["severity"] == "warning"


def test_slow_streak_needs_three_samples():
    two = inc.rpc_incidents("wss://e", "evm", [_s(1, 1500), _s(2, 1600)], 1000, 3000)
    three = inc.rpc_incidents("wss://e", "evm", [_s(1, 1500), _s(2, 1600), _s(3, 1700)], 1000, 3000)
    assert not [i for i in two if i["kind"] == "rpc_slow"]
    assert [i for i in three if i["kind"] == "rpc_slow"]


def test_degraded_streak_wins_over_slow():
    out = inc.rpc_incidents("wss://e", "evm", [_s(1, 5000), _s(2, 6000)], 1000, 3000)
    kinds = {i["kind"] for i in out}
    assert "rpc_degraded" in kinds and "rpc_slow" not in kinds


def test_recovery_clears_streak():
    out = inc.rpc_incidents("wss://e", "evm", [_s(1, 5000), _s(2, 6000), _s(3, 200)], 1000, 3000)
    assert not [i for i in out if i["kind"] in ("rpc_slow", "rpc_degraded")]


def test_stale_probe_detected():
    out = inc.rpc_incidents("wss://e", "evm", [_s(1000, 200)], 1000, 3000, now=1000 + 500)
    assert [i["kind"] for i in out] == ["rpc_stale"]


def test_block_stall_uses_own_chain_history_only():
    out = inc.block_lag_incident("evm", {"last_block": 10, "stale_for_seconds": 300})
    assert out[0]["kind"] == "block_head_stalled"
    assert "own-chain reference only" in out[0]["detail"]
    assert inc.block_lag_incident("evm", {"last_block": 10, "stale_for_seconds": 5}) == []


def test_collect_orders_by_severity_and_reports_counts():
    result = inc.collect(
        validator_changes=[{"address": "A", "field": "commission_pct", "old": "10", "new": "40"}],
        rpc_reports=[{"endpoint": "wss://e", "chain_family": "evm", "samples": [_s(1, None, False, "transport")],
                      "slow_ms": 1000, "degraded_ms": 3000, "block_progress": None}],
        now=2,
    )
    assert result["count"] == 2
    assert result["incidents"][0]["severity"] == "critical"
    assert result["by_severity"]["critical"] == 2


def test_empty_input_is_empty_not_fabricated():
    result = inc.collect()
    assert result["count"] == 0
    assert result["incidents"] == []
