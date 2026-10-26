"""Failure-scenario tests for the V3 validators/overview fallback.

Chain reads are replaced with fakes; no network. Run:
  cd backend && <python-with-pytest> -m pytest tests/test_v3_fallback.py -q
"""
import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "app"))

import app.v3 as v3  # noqa: E402
from fastapi import HTTPException  # noqa: E402

VALIDATORS_OK = {"network": "PortaldotV3 Testnet", "validators": [{"address": "5A"}], "block_number": 100}
OVERVIEW_OK = {"network": "PortaldotV3 Testnet", "latest_block": {"block_number": 100}, "validator_count": 1}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    v3._LAST_GOOD.clear()
    v3._INFLIGHT.clear()
    monkeypatch.setattr(v3, "V3_RPC_TIMEOUT", 0.5)
    monkeypatch.setattr(v3, "V3_VALIDATORS_TTL", 0.0)  # force a live read on every call
    monkeypatch.setattr(v3, "V3_OVERVIEW_TTL", 0.0)
    yield


def _ok(payload):
    return lambda: dict(payload)


def _boom(exc):
    def f():
        raise exc
    return f


def _slow(seconds, payload):
    def f():
        time.sleep(seconds)
        return dict(payload)
    return f


def test_overview_502_while_validators_succeed(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _ok(VALIDATORS_OK))
    monkeypatch.setattr(v3, "_overview_uncached", _boom(RuntimeError("502 upstream")))
    vals = v3.validators()
    assert vals["served_from"] == "live" and vals["stale"] is False
    assert len(vals["validators"]) == 1
    with pytest.raises(HTTPException) as err:  # no overview cache yet -> explicit 503, no invented data
        v3.overview()
    assert err.value.status_code == 503


def test_validators_rpc_timeout_returns_stale_cache(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _ok(VALIDATORS_OK))
    assert v3.validators()["served_from"] == "live"  # prime last-good
    monkeypatch.setattr(v3, "_validators_uncached", _slow(2.0, VALIDATORS_OK))
    body = v3.validators()
    assert body["served_from"] == "cache"
    assert body["stale"] is True
    assert body["error"] and "Timeout" in body["error"] or "timeout" in body["error"].lower()
    assert body["blockNumber"] == 100 and isinstance(body["cachedAt"], int)
    assert len(body["validators"]) == 1  # cached rows still returned


def test_validators_http_5xx_returns_stale_cache(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _ok(VALIDATORS_OK))
    v3.validators()
    monkeypatch.setattr(v3, "_validators_uncached", _boom(RuntimeError("HTTP 503 from RPC")))
    body = v3.validators()
    assert body["stale"] is True and body["served_from"] == "cache"
    assert "503" in body["error"]


def test_both_endpoints_fail_with_valid_cache(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _ok(VALIDATORS_OK))
    monkeypatch.setattr(v3, "_overview_uncached", _ok(OVERVIEW_OK))
    v3.validators(); v3.overview()
    monkeypatch.setattr(v3, "_validators_uncached", _boom(RuntimeError("down")))
    monkeypatch.setattr(v3, "_overview_uncached", _boom(RuntimeError("down")))
    vals, ov = v3.validators(), v3.overview()
    assert vals["stale"] and ov["stale"]
    assert vals["served_from"] == ov["served_from"] == "cache"
    assert ov["blockNumber"] == 100


def test_empty_cache_and_both_fail_gives_503_not_fake_data(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _boom(RuntimeError("down")))
    monkeypatch.setattr(v3, "_overview_uncached", _boom(RuntimeError("down")))
    for fn in (v3.validators, v3.overview):
        with pytest.raises(HTTPException) as err:
            fn()
        assert err.value.status_code == 503
        assert err.value.detail["served_from"] is None


def test_recovery_switches_back_to_live(monkeypatch):
    monkeypatch.setattr(v3, "_validators_uncached", _ok(VALIDATORS_OK))
    v3.validators()
    monkeypatch.setattr(v3, "_validators_uncached", _boom(RuntimeError("down")))
    assert v3.validators()["stale"] is True
    fresh = {**VALIDATORS_OK, "block_number": 150}
    monkeypatch.setattr(v3, "_validators_uncached", _ok(fresh))
    body = v3.validators()
    assert body["served_from"] == "live" and body["stale"] is False
    assert body["blockNumber"] == 150 and body["error"] is None


def test_concurrent_callers_share_one_rpc_read(monkeypatch):
    calls = {"n": 0}

    def counted():
        calls["n"] += 1
        time.sleep(0.2)
        return dict(VALIDATORS_OK)

    monkeypatch.setattr(v3, "_validators_uncached", counted)
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda _: v3.validators(), range(5)))
    assert calls["n"] == 1, f"expected 1 RPC read, got {calls['n']}"
    assert all(r["served_from"] == "live" for r in results)


def test_ttl_serves_cache_without_rpc(monkeypatch):
    calls = {"n": 0}

    def counted():
        calls["n"] += 1
        return dict(VALIDATORS_OK)

    monkeypatch.setattr(v3, "_validators_uncached", counted)
    monkeypatch.setattr(v3, "V3_VALIDATORS_TTL", 60.0)
    v3.validators(); v3.validators()
    assert calls["n"] == 1
