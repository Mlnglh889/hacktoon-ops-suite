import importlib
import app.rpc_health as rh


def fresh():
    importlib.reload(rh)
    return rh


def test_breaker_opens_after_threshold(monkeypatch):
    h = fresh()
    monkeypatch.setattr(h, "FAILURE_THRESHOLD", 3)
    def boom(*a, **k): raise ConnectionError("down")
    monkeypatch.setattr(h, "_rpc", boom)
    ws = "wss://dead.example.invalid"
    for _ in range(3):
        r = h.probe(ws)
        assert r["ok"] is False and r["latency_ms"] is not None
    assert h._breaker(ws).state() == "open"
    r = h.probe(ws)
    assert r["state"] == "open" and r["source"] == "rpc_health circuit breaker"


def test_half_open_after_cooldown(monkeypatch):
    h = fresh()
    monkeypatch.setattr(h, "FAILURE_THRESHOLD", 1)
    monkeypatch.setattr(h, "COOLDOWN_S", 0)
    monkeypatch.setattr(h, "_rpc", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")))
    ws = "wss://cool.example.invalid"
    h.probe(ws)
    assert h._breaker(ws).state() == "half_open"


def test_success_resets_breaker(monkeypatch):
    h = fresh()
    monkeypatch.setattr(h, "FAILURE_THRESHOLD", 2)
    ws = "wss://ok.example.invalid"
    monkeypatch.setattr(h, "_rpc", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("x")))
    h.probe(ws)
    monkeypatch.setattr(h, "_rpc", lambda *a, **k: {"number": "0x10"})
    r = h.probe(ws)
    assert r["ok"] is True and r["block_number"] == 16 and r["latency_ms"] is not None
    assert h._breaker(ws).failures == 0


def test_endpoints_env(monkeypatch):
    h = fresh()
    monkeypatch.setenv("V3_RPC_ENDPOINTS", "wss://a, wss://b ,")
    assert h.endpoints() == ["wss://a", "wss://b"]
    monkeypatch.delenv("V3_RPC_ENDPOINTS")
    assert h.endpoints() == ["wss://test-node-v3.portaldot.dev", "https://test-evm-rpc-v3.portaldot.dev"]


def test_family_detection():
    h = fresh()
    assert h.family_of("https://test-evm-rpc-v3.portaldot.dev") == "evm"
    assert h.family_of("wss://test-node-v3.portaldot.dev") == "substrate"


def test_evm_probe_rejects_wrong_chain(monkeypatch):
    h = fresh()
    monkeypatch.setattr(h, "_rpc", lambda url, m, p: "0x1" if m == "eth_chainId" else "0x10")
    try:
        h.probe_evm("https://test-evm-rpc-v3.portaldot.dev")
        assert False, "expected chain id mismatch"
    except RuntimeError as e:
        assert "unexpected eth_chainId" in str(e)


def test_evm_probe_reports_block(monkeypatch):
    h = fresh()
    vals = {"eth_chainId": "0x190f1ca9", "eth_blockNumber": "0x3073d"}
    monkeypatch.setattr(h, "_rpc", lambda url, m, p: vals[m])
    number, method = h.probe_evm("https://test-evm-rpc-v3.portaldot.dev")
    assert number == 198461 and method == "eth_chainId + eth_blockNumber"


def test_latency_status_thresholds(monkeypatch):
    h = fresh()
    monkeypatch.setattr(h, "SLOW_MS", 1000)
    monkeypatch.setattr(h, "DEGRADED_MS", 3000)
    assert h._latency_status(999, True) == "healthy"
    assert h._latency_status(1000, True) == "slow"
    assert h._latency_status(3001, True) == "degraded"
    assert h._latency_status(10, False) == "failing"


def test_percentiles_are_real_sample_values():
    h = fresh()
    assert h._percentile([100, 200, 300, 400, 500], .5) == 300
    assert h._percentile([], .5) is None


def test_history_empty_is_explicit(monkeypatch, tmp_path):
    h = fresh()
    monkeypatch.setattr(h, "HISTORY_DB", str(tmp_path / "empty.db"))
    out = h._history("https://empty.example")
    assert out["sample_count"] == 0
    assert out["p50_ms"] is None and out["error_rate"] is None
    assert out["samples"] == []


def test_history_partial_excludes_null_latency(monkeypatch, tmp_path):
    h = fresh()
    monkeypatch.setattr(h, "HISTORY_DB", str(tmp_path / "partial.db"))
    h._store([{"endpoint":"x", "chain_family":"evm", "checked_at":1, "latency_ms":100, "block_number":1, "ok":True, "state":"closed", "error":None, "source":"test"}, {"endpoint":"x", "chain_family":"evm", "checked_at":2, "latency_ms":None, "block_number":None, "ok":False, "state":"closed", "error":"timeout", "source":"test"}])
    out = h._history("x")
    assert out["sample_count"] == 2 and out["p50_ms"] == 100 and out["error_rate"] == .5


def test_history_populated_window(monkeypatch, tmp_path):
    h = fresh()
    monkeypatch.setattr(h, "HISTORY_DB", str(tmp_path / "full.db"))
    h._store([{"endpoint":"x", "chain_family":"substrate", "checked_at":int(__import__('time').time()), "latency_ms":n, "block_number":n, "ok":True, "state":"closed", "error":None, "source":"test"} for n in (100,200,300)])
    out = h._history("x")
    assert out["sample_count"] == 3 and out["p50_ms"] == 200 and len(out["samples"]) == 3


def test_window_history_is_chronological_and_delta_positive(monkeypatch, tmp_path):
    h = fresh()
    monkeypatch.setattr(h, "HISTORY_DB", str(tmp_path / "win.db"))
    now = int(__import__('time').time())
    h._store([
        {"endpoint": "y", "chain_family": "evm", "checked_at": now - 300, "latency_ms": 100, "block_number": 10, "ok": True, "state": "closed", "error": None, "source": "t"},
        {"endpoint": "y", "chain_family": "evm", "checked_at": now - 200, "latency_ms": 120, "block_number": 12, "ok": True, "state": "closed", "error": None, "source": "t"},
        {"endpoint": "y", "chain_family": "evm", "checked_at": now - 100, "latency_ms": 140, "block_number": 15, "ok": True, "state": "closed", "error": None, "source": "t"},
    ])
    out = h._history("y", now - 3600)
    assert [s["block_number"] for s in out["samples"]] == [10, 12, 15]
    assert out["block_progress"]["delta"] == 5
    assert out["block_progress"]["last_block"] == 15
    assert out["block_progress"]["seconds_since_change"] == 0


def test_failure_kinds_classified():
    import requests
    h = fresh()
    assert h.failure_kind(requests.exceptions.ConnectionError("x")) == "transport"
    assert h.failure_kind(requests.exceptions.Timeout("x")) == "transport"
    assert h.failure_kind(RuntimeError("unexpected eth_chainId")) == "protocol"
    assert h.failure_kind(ValueError("boom")) == "internal"
