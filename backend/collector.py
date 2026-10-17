"""Portaldot V3 testnet collector: blocks, active validators, era staking and points."""
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

from .collector_logic import normalize_commission, normalize_exposure, normalize_points

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
WS_URL = os.getenv("PORTALDOT_WS", "wss://test-node-v3.portaldot.dev")
DB_PATH = Path(os.getenv("STAKEHUB_DB", str(ROOT / "data" / "ops-suite.db")))


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        con.executescript((ROOT / "backend" / "schema.sql").read_text())


def connect() -> SubstrateInterface:
    return SubstrateInterface(url=WS_URL, ss58_format=42, type_registry_preset="kusama")


def _query(ss: SubstrateInterface, module: str, storage: str, params: list[Any] | None = None) -> Any:
    return ss.query(module, storage, params or []).value


def collect_once() -> dict[str, Any]:
    init_db()
    ss = connect()
    now = int(time.time())
    try:
        health: dict[str, Any] = ss.rpc_request("system_health", [])
        header: dict[str, Any] = ss.rpc_request("chain_getHeader", []).get("result", {})
        block_number = int(header["number"], 16)
        block_hash: str = ss.rpc_request("chain_getBlockHash", [block_number]).get("result")
        era = _query(ss, "Staking", "CurrentEra")
        active = [str(v) for v in (_query(ss, "Session", "Validators") or [])]
        network_total = 0
        rows: list[dict[str, Any]] = []
        points = normalize_points(_query(ss, "Staking", "ErasRewardPoints", [era]))
        for address in active:
            exposure = normalize_exposure(_query(ss, "Staking", "ErasStakers", [era, address]))
            commission = normalize_commission(_query(ss, "Staking", "ErasValidatorPrefs", [era, address]))
            network_total += int(float(exposure["total_pot"]) * 10**14)
            rows.append({"address": address, "exposure": exposure, "commission_pct": commission, "points": points.get(address, 0)})

        with sqlite3.connect(DB_PATH) as con:
            con.execute("INSERT OR REPLACE INTO blocks(block_number, block_hash, captured_at) VALUES (?, ?, ?)", (block_number, block_hash, now))
            for row in rows:
                con.execute("INSERT OR REPLACE INTO validators(address, first_seen_block, nickname, last_seen) VALUES (?, COALESCE((SELECT first_seen_block FROM validators WHERE address=?), ?), COALESCE((SELECT nickname FROM validators WHERE address=?), NULL), ?)", (row["address"], row["address"], block_number, row["address"], now))
                ex = row["exposure"]
                con.execute("INSERT OR REPLACE INTO era_stake(era,address,total_pot,own_pot,nominator_count,commission_pct,captured_at) VALUES (?,?,?,?,?,?,?)", (era, row["address"], ex["total_pot"], ex["own_pot"], ex["nominator_count"], row["commission_pct"], now))
                con.execute("INSERT OR REPLACE INTO era_points(era,address,points,captured_at) VALUES (?,?,?,?)", (era, row["address"], row["points"], now))
            con.commit()
        return {"chain": ss.rpc_request("system_chain", []).get("result"), "health": health.get("result"), "block_number": block_number, "block_hash": block_hash, "era": era, "active_validator_count": len(active), "validators": rows, "ws_url": WS_URL, "db_path": str(DB_PATH)}
    finally:
        ss.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if not args.once:
        parser.error("only --once is implemented")
    print(json.dumps(collect_once(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

__all__ = ["collect_once", "init_db"]

