"""OpsRegistry heartbeat interface placeholder until testnet signer/gas is available.

This module is intentionally read-only today. The final implementation must use an
extension-controlled signer or an explicitly supplied testnet signer, never a key
stored in source or an environment copied into logs.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class HeartbeatProof:
    network: str
    contract_address: str
    tx_hash: str
    explorer_url: str


def explorer_tx_url(tx_hash: str) -> str:
    return f"https://node-console.portaldot.dev/tx/{tx_hash}"


def record_heartbeat_proof(contract_address: str, tx_hash: str) -> HeartbeatProof:
    if not contract_address or not tx_hash:
        raise ValueError("contract address and transaction hash are required")
    return HeartbeatProof(
        network="PortaldotV3 Test",
        contract_address=contract_address,
        tx_hash=tx_hash,
        explorer_url=explorer_tx_url(tx_hash),
    )


__all__ = ["HeartbeatProof", "explorer_tx_url", "record_heartbeat_proof"]

# Signing/deployment intentionally remains disabled until gas and signer authority exist.
DEPLOYMENT_STATUS = "blocked_pending_testnet_gas_and_explicit_signer"
assert DEPLOYMENT_STATUS.startswith("blocked_")
