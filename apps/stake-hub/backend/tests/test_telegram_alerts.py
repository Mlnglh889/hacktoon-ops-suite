import json

import app.telegram_alerts as ta


def test_identity_is_stable():
    incident = {"kind": "rpc_slow", "severity": "warning", "title": "Slow", "evidence": {"endpoint": "x", "latest_ms": 1200}}
    assert ta.incident_identity(incident) == ta.incident_identity(json.loads(json.dumps(incident)))


def test_info_is_never_delivered(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, "STATE_DB", str(tmp_path / "state.db"))
    monkeypatch.setattr(ta, "_config", lambda: ("token", "chat"))
    monkeypatch.setattr(ta, "send_text", lambda *args: (_ for _ in ()).throw(AssertionError("info sent")))
    result = ta.deliver([{ "kind": "membership_change", "severity": "info", "title": "Info" }])
    assert result == {"sent": 0, "skipped": 1, "failed": 0}


def test_warning_sends_once_then_dedupes(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, "STATE_DB", str(tmp_path / "state.db"))
    monkeypatch.setattr(ta, "_config", lambda: ("token", "chat"))
    sent = []
    monkeypatch.setattr(ta, "send_text", lambda text, token, chat: sent.append((text, token, chat)) or {"ok": True})
    incident = {"kind": "rpc_slow", "severity": "warning", "title": "Slow", "detail": "3 probes", "evidence": {"endpoint": "x"}}
    assert ta.deliver([incident])["sent"] == 1
    assert ta.deliver([incident])["skipped"] == 1
    assert len(sent) == 1 and "token" not in sent[0][0]


def test_critical_message_contains_evidence(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, "STATE_DB", str(tmp_path / "state.db"))
    monkeypatch.setattr(ta, "_config", lambda: ("token", "chat"))
    sent = []
    monkeypatch.setattr(ta, "send_text", lambda text, token, chat: sent.append(text) or {"ok": True})
    incident = {"kind": "rpc_degraded", "severity": "critical", "title": "Degraded", "evidence": {"endpoint": "https://rpc", "latest_ms": 4000}}
    ta.deliver([incident])
    assert "CRITICAL" in sent[0] and "https://rpc" in sent[0] and "4000" in sent[0]


def test_identity_ignores_volatile_stale_and_latency():
    base = {"kind": "block_head_stalled", "severity": "warning", "title": "Head stalled", "evidence": {"family": "evm", "last_block": 10, "stale_for_seconds": 100, "latest_ms": 2200}}
    newer = {**base, "evidence": {"family": "evm", "last_block": 11, "stale_for_seconds": 160, "latest_ms": 900}}
    assert ta.incident_identity(base) == ta.incident_identity(newer)
