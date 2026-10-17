"""Read-only native POT balance lookup for Portaldot V3 accounts."""
from __future__ import annotations

import os
from typing import Any

from substrateinterface import SubstrateInterface

WS_URL = os.getenv("PORTALDOT_WS", "wss://test-node-v3.portaldot.dev")
POT_DECIMALS = 14


def account_balance(address: str) -> dict[str, Any]:
    substrate = SubstrateInterface(url=WS_URL, ss58_format=42, type_registry_preset="kusama")
    try:
        account = substrate.query("System", "Account", [address]).value or {}
        data = account.get("data", {}) if isinstance(account, dict) else {}
        free_raw = int(data.get("free", 0))
        reserved_raw = int(data.get("reserved", 0))
        misc_frozen_raw = int(data.get("misc_frozen", 0))
        fee_frozen_raw = int(data.get("fee_frozen", 0))
        return {
            "network": "PortaldotV3 Test",
            "address": address,
            "free_raw": free_raw,
            "reserved_raw": reserved_raw,
            "free_pot": free_raw / 10**POT_DECIMALS,
            "reserved_pot": reserved_raw / 10**POT_DECIMALS,
            "frozen_pot": max(misc_frozen_raw, fee_frozen_raw) / 10**POT_DECIMALS,
            "decimals": POT_DECIMALS,
            "source": "System.Account via PortaldotV3 WS",
        }
    finally:
        substrate.close()
