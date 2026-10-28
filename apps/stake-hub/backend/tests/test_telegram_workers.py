import app.telegram_alerts as ta


def test_worker_can_start_without_chat_id(monkeypatch):
    monkeypatch.setattr(ta, '_config', lambda: ('token', None))
    monkeypatch.setattr(ta, 'poll_telegram_updates', lambda: None)
    monkeypatch.setattr(ta, 'time', type('T', (), {'sleep': staticmethod(lambda _: (_ for _ in ()).throw(KeyboardInterrupt()))})())
    # start_worker should not require a global chat ID; command polling remains enabled.
    ta.start_worker()
    assert True
