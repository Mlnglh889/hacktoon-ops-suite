import app.telegram_alerts as ta


def test_guide_lists_features(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/guide'}})
    msg=sent[-1][1]
    assert 'Fitur Portaldot Alerts' in msg
    assert 'commission' in msg
    assert 'RPC latency' in msg
    assert 'Deduplikasi' in msg
    assert 'seed phrase' in msg


def test_guide_does_not_require_subscription(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    ta._handle_update({'message': {'chat': {'id': 999}, 'text': '/guide'}})
    assert sent
    con=ta._db(); assert con.execute('select count(*) from subscriptions').fetchone()[0] == 0; con.close()

# Test does not use real wallet or secret material.
