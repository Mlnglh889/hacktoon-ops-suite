import app.telegram_alerts as ta


def test_ss58_shape():
    assert ta._valid_ss58('5' + 'A' * 47)
    assert not ta._valid_ss58('0x' + 'a' * 40)
    assert not ta._valid_ss58('short')


def test_start_creates_awaiting_address(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]
    monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/start'}})
    con=ta._db(); row=con.execute('select chat_id,state from subscriptions').fetchone(); con.close()
    assert tuple(row) == ('123','awaiting_address')
    assert sent and 'alamat' in sent[0][1].lower()


def test_confirm_activates_address(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/start'}})
    address='5'+'A'*47
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': address}})
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': 'CONFIRM'}})
    con=ta._db(); row=con.execute('select address,state from subscriptions').fetchone(); con.close()
    assert row[0] == address and row[1] == 'active'
    assert 'Aktif' in sent[-1][1]


def test_cancel_does_not_activate(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    monkeypatch.setattr(ta, '_send_for_chat', lambda *args: None)
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': '/start'}})
    ta._handle_update({'message': {'chat': {'id': 123}, 'text': 'CANCEL'}})
    con=ta._db(); state=con.execute('select state from subscriptions').fetchone()[0]; con.close()
    assert state == 'cancelled'


# No keys, seeds, or real addresses are used beyond synthetic test-shaped input.
