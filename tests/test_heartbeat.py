from backend.heartbeat import (
    explorer_tx_url,
    heartbeat_payload_hash,
    record_heartbeat_proof,
)


def test_explorer_url_is_portaldot_v3():
    assert explorer_tx_url("0xabc") == "https://node-console.portaldot.dev/tx/0xabc"


def test_heartbeat_proof_requires_both_identifiers():
    try:
        record_heartbeat_proof("", "0xabc")
    except ValueError:
        pass
    else:
        raise AssertionError("missing contract address must fail")


def test_heartbeat_proof_is_network_scoped():
    proof = record_heartbeat_proof("0xcontract", "0xtx", 123, 1)
    assert proof.network == "PortaldotV3 Test"
    assert proof.block_number == 123
    assert proof.receipt_status == 1


def test_payload_hash_is_deterministic_bytes32():
    args = dict(block=71886, era=20, validator_count=2, latest_block_hash="0xabc")
    first = heartbeat_payload_hash(**args)
    second = heartbeat_payload_hash(**args)
    assert first == second
    assert first.startswith("0x")
    assert len(first) == 66
