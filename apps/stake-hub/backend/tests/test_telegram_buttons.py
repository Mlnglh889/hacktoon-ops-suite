import app.telegram_alerts as ta


def test_subscription_keyboard_has_confirm_cancel():
    keyboard = ta._subscription_keyboard()
    buttons = keyboard['inline_keyboard'][0]
    assert buttons[0]['callback_data'] == 'alert_confirm'
    assert buttons[1]['callback_data'] == 'alert_cancel'


def test_confirm_callback_activates_subscription(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    sent=[]; answered=[]
    monkeypatch.setattr(ta, '_send_for_chat', lambda *args: sent.append(args))
    monkeypatch.setattr(ta, '_answer_callback', lambda *args: answered.append(args))
    con=ta._db(); con.execute("INSERT INTO subscriptions(chat_id,address,state,created_at,updated_at) VALUES(?,?,?,?,?)", ('123','5'+'A'*47,'awaiting_confirm',1,1)); con.commit(); con.close()
    ta._handle_update({'callback_query': {'id':'cb1','data':'alert_confirm','message':{'chat':{'id':123}}}})
    con=ta._db(); state=con.execute('select state from subscriptions').fetchone()[0]; con.close()
    assert state == 'active' and answered and sent


def test_cancel_callback_cancels_subscription(monkeypatch, tmp_path):
    monkeypatch.setattr(ta, 'STATE_DB', str(tmp_path / 'state.db'))
    monkeypatch.setattr(ta, '_config', lambda: ('token', 'chat'))
    monkeypatch.setattr(ta, '_send_for_chat', lambda *args: None)
    monkeypatch.setattr(ta, '_answer_callback', lambda *args: None)
    con=ta._db(); con.execute("INSERT INTO subscriptions(chat_id,address,state,created_at,updated_at) VALUES(?,?,?,?,?)", ('123','5'+'A'*47,'awaiting_confirm',1,1)); con.commit(); con.close()
    ta._handle_update({'callback_query': {'id':'cb1','data':'alert_cancel','message':{'chat':{'id':123}}}})
    con=ta._db(); state=con.execute('select state from subscriptions').fetchone()[0]; con.close()
    assert state == 'cancelled'


def test_send_text_accepts_markup(monkeypatch):
    class R:
        def raise_for_status(self): pass
        def json(self): return {'ok': True}
    calls=[]
    monkeypatch.setattr(ta.requests, 'post', lambda *args, **kwargs: calls.append(kwargs) or R())
    ta.send_text('x','t','c', {'inline_keyboard': []})
    assert calls[0]['json']['reply_markup']['inline_keyboard'] == []

# Test-only synthetic addresses; no key material.
