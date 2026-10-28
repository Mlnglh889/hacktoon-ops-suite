import app.telegram_alerts as ta


def test_status_and_help_commands(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    con=ta._db(); con.execute("INSERT INTO subscriptions(chat_id,address,state,created_at,updated_at) VALUES(?,?,?,?,?)", ('123','5'+'A'*47,'active',1,1)); con.commit(); con.close()
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/status'}})
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/help'}})
    assert 'Subscription aktif' in sent[0][1]
    assert '/start' in sent[1][1] and '/stop' in sent[1][1]


def test_stop_command_cancels(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    monkeypatch.setattr(ta, '_send_for_chat', lambda *args: None)
    con=ta._db(); con.execute("INSERT INTO subscriptions(chat_id,address,state,created_at,updated_at) VALUES(?,?,?,?,?)", ('123','5'+'A'*47,'active',1,1)); con.commit(); con.close()
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/stop'}})
    con=ta._db(); assert con.execute('select state from subscriptions').fetchone()[0] == 'cancelled'; con.close()
