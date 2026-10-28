import app.rpc_health as h


def test_candidates_are_family_specific(monkeypatch):
    monkeypatch.setenv('V3_RPC_EVM_ENDPOINTS', 'https://a, https://b, https://a')
    assert h.endpoint_candidates('https://test-evm-rpc-v3.portaldot.dev') == ['https://a', 'https://b']


def test_probe_uses_second_candidate_after_first_fails(monkeypatch):
    h._BREAKERS.clear()
    monkeypatch.setenv('V3_RPC_EVM_ENDPOINTS', 'https://bad-evm, https://good-evm')
    def fake(url):
        if url == 'https://bad-evm':
            raise ConnectionError('down')
        return 10, 'eth_blockNumber', url
    monkeypatch.setattr(h, '_probe_one', fake)
    row = h.probe('https://bad-evm')
    assert row['ok'] is True
    assert row['active_endpoint'] == 'https://good-evm'
    assert row['failover_used'] is True
    assert row['block_number'] == 10


def test_all_candidates_fail_is_explicit(monkeypatch):
    h._BREAKERS.clear()
    monkeypatch.setenv('V3_RPC_EVM_ENDPOINTS', 'https://bad1-evm, https://bad2-evm')
    monkeypatch.setattr(h, '_probe_one', lambda url: (_ for _ in ()).throw(ConnectionError(url)))
    row = h.probe('https://bad1-evm')
    assert row['ok'] is False
    assert row['source'] == 'all configured RPC candidates failed'
    assert row['attempted_endpoints'] == ['https://bad1-evm', 'https://bad2-evm']
    assert 'bad2-evm' in row['error']


def test_default_has_no_fabricated_backup(monkeypatch):
    monkeypatch.delenv('V3_RPC_EVM_ENDPOINTS', raising=False)
    assert h.endpoint_candidates('https://test-evm-rpc-v3.portaldot.dev') == ['https://test-evm-rpc-v3.portaldot.dev']

# Candidate endpoints are supplied by configuration; tests use synthetic URLs only.
