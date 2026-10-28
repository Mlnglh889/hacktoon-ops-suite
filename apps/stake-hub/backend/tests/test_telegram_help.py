import app.telegram_alerts as ta


def test_help_includes_user_info(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    con=ta._db(); con.execute("INSERT INTO subscriptions(chat_id,address,state,created_at,updated_at) VALUES(?,?,?,?,?)", ('123','5'+'A'*47,'active',1,1)); con.commit(); con.close()
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/help'}})
    msg=sent[-1][1]
    assert 'Status: aktif' in msg
    assert 'Wallet: 5AAAAA…AAAA' in msg
    assert '/start' in msg and '/status' in msg and '/stop' in msg


def test_help_unsubscribed_shows_unconfigured(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/help'}})
    assert 'Status: belum aktif' in sent[-1][1]
    assert 'Wallet: belum diatur' in sent[-1][1]
