"""Heartbeat proof model and deterministic payload preparation.

Signing/broadcast remains wallet-controlled. This module never handles private keys.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib, json

@dataclass(frozen=True)
class HeartbeatProof:
    network: str
    contract_address: str
    tx_hash: str
    explorer_url: str
    block_number: int | None = None
    receipt_status: int | None = None


def explorer_tx_url(tx_hash: str) -> str:
    return f"https://node-console.portaldot.dev/tx/{tx_hash}"


def record_heartbeat_proof(contract_address: str, tx_hash: str, block_number: int | None = None, receipt_status: int | None = None) -> HeartbeatProof:
    if not contract_address or not tx_hash:
        raise ValueError("contract address and transaction hash are required")
    return HeartbeatProof("PortaldotV3 Test", contract_address, tx_hash, explorer_tx_url(tx_hash), block_number, receipt_status)


def heartbeat_payload_hash(*, block: int, era: int, validator_count: int, latest_block_hash: str) -> str:
    payload = {"schema":"portaldot-ops-heartbeat/v1", "network":"PortaldotV3 Test", "chain_id":420420777, "block":block, "era":era, "validator_count":validator_count, "latest_block_hash":latest_block_hash}
    canonical=json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "0x" + hashlib.sha256(canonical).hexdigest()

__all__=["HeartbeatProof","explorer_tx_url","record_heartbeat_proof","heartbeat_payload_hash"]
DEPLOYMENT_STATUS="prepared_pending_wallet_sign_and_broadcast"
assert DEPLOYMENT_STATUS.startswith("prepared_")
