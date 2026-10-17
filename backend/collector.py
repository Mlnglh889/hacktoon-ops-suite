"""One-shot Portaldot V3 testnet health/collector foundation."""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from substrateinterface import SubstrateInterface

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
WS_URL = os.getenv("PORTALDOT_WS", "wss://test-node-v3.portaldot.dev")
DB_PATH = Path(os.getenv("STAKEHUB_DB", str(ROOT / "data" / "ops-suite.db")))
RAW_PER_POT = 10**14
COMMISSION_DIVISOR = 10**7


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.executescript((ROOT / "backend" / "schema.sql").read_text())


def connect() -> SubstrateInterface:
    return SubstrateInterface(url=WS_URL, ss58_format=42, type_registry_preset="kusama")


def collect_once() -> dict[str, Any]:
    init_db()
    ss = connect()
    try:
        health: dict[str, Any] = ss.rpc_request("system_health", [])  # type: ignore[assignment]
        header: dict[str, Any] = ss.rpc_request("chain_getHeader", []) .get("result", {})  # type: ignore[union-attr]
        block_number = int(header["number"], 16)
        block_hash: str = ss.rpc_request("chain_getBlockHash", [block_number]).get("result")  # type: ignore[union-attr]
        now = int(time.time())
        with sqlite3.connect(DB_PATH) as con:
            con.execute(
                "INSERT OR REPLACE INTO blocks(block_number, block_hash, captured_at) VALUES (?, ?, ?)",
                (block_number, block_hash, now),
            )
        chain_response: dict[str, Any] = ss.rpc_request("system_chain", [])  # type: ignore[assignment]
        return {
            "chain": chain_response.get("result"),
            "health": health.get("result"),
            "block_number": block_number,
            "block_hash": block_hash,
            "ws_url": WS_URL,
            "db_path": str(DB_PATH),
        }
    finally:
        ss.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="collect one health/block sample")
    args = parser.parse_args()
    if not args.once:
        parser.error("only --once is implemented in foundation commit")
    print(json.dumps(collect_once(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()


__all__ = ["collect_once", "init_db"]

# Keep conversion constants explicit for the next validator/era module.
assert RAW_PER_POT == 100_000_000_000_000
assert COMMISSION_DIVISOR == 10_000_000
_assert_json = json.dumps({"module": "collector", "version": 1})
assert _assert_json
_canonical_path = Path(__file__).resolve()
assert _canonical_path.name == "collector.py"

