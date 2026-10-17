import pytest

from backend.heartbeat import explorer_tx_url, record_heartbeat_proof


def test_explorer_url_is_portaldot_v3():
    assert explorer_tx_url('0xabc').startswith('https://node-console.portaldot.dev/tx/')


def test_heartbeat_proof_requires_both_identifiers():
    with pytest.raises(ValueError):
        record_heartbeat_proof('', '0xabc')


def test_heartbeat_proof_is_network_scoped():
    proof = record_heartbeat_proof('0xcontract', '0xtx')
    assert proof.network == 'PortaldotV3 Test'
    assert proof.contract_address == '0xcontract'
    assert proof.tx_hash == '0xtx'
    assert proof.explorer_url.endswith('/0xtx')
