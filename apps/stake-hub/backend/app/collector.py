"""Chain data collector — connects to Portaldot mainnet via substrate-interface."""
import os
import time
import sqlite3
import threading
from substrateinterface import SubstrateInterface

WS_URL = os.getenv("PORTALDOT_WS", "wss://mainnet.portaldot.io")
DB_PATH = os.getenv("STAKEHUB_DB", os.path.join(os.path.dirname(__file__), "data", "stakehub.db"))

_ss = None


def get_substrate() -> SubstrateInterface:
    """Return a live substrate connection; reconnect if the cached websocket died
    (stale ws = ssl.BrokenPipeError on any query — seen 12 Okt on /staking/overview)."""
    global _ss
    if _ss is not None:
        try:
            _ss.rpc_request("system_health", [])
            return _ss
        except Exception:
            try:
                _ss.close()
            except Exception:
                pass
            _ss = None
    _ss = SubstrateInterface(url=WS_URL, ss58_format=42, type_registry_preset="kusama")
    return _ss


def init_db():
    con = sqlite3.connect(DB_PATH)
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS blocks (
            number INTEGER PRIMARY KEY, hash TEXT, time INTEGER
        );
        CREATE TABLE IF NOT EXISTS validators (
            address TEXT PRIMARY KEY, commission INTEGER, self_stake TEXT,
            total_stake TEXT, last_seen INTEGER
        );
        CREATE TABLE IF NOT EXISTS eras (
            era INTEGER PRIMARY KEY, rewards TEXT, total_stake TEXT, time INTEGER
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER,
            kind TEXT, message TEXT
        );
        """
    )
    con.commit()
    con.close()


def poll_block():
    ss = get_substrate()
    blk = ss.rpc_request("chain_getHeader", [])
    header = blk.get("result", {})
    number = int(header["number"], 16)
    h = header["parentHash"]  # header has parentHash; block hash comes from get_block_hash
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "INSERT OR IGNORE INTO blocks (number, hash, time) VALUES (?, ?, ?)",
        (number, h, int(time.time())),
    )
    con.commit()
    con.close()
    return number


def poll_validators():
    ss = get_substrate()
    vals = ss.query("Session", "Validators", []).value
    era = ss.query("Staking", "CurrentEra", []).value
    con = sqlite3.connect(DB_PATH)
    now = int(time.time())
    total_all = 0
    for v in vals:
        try:
            prefs = ss.query("Staking", "Validators", [v]).value
            commission = prefs.get("commission", 0)
            total_stake = 0
            try:
                es = ss.query("Staking", "ErasStakers", [era, v]).value
                total_stake = int(es.get("total", 0))
            except Exception:
                total_stake = 0
            total_all += total_stake
            con.execute(
                "INSERT OR REPLACE INTO validators (address, commission, self_stake, total_stake, last_seen) "
                "VALUES (?, ?, ?, ?, ?)",
                (v, commission, 0, str(total_stake), now),
            )
        except Exception:
            continue
    con.execute(
        "INSERT OR REPLACE INTO eras (era, rewards, total_stake, time) VALUES (?, '0', ?, ?)",
        (era, str(total_all), now),
    )
    con.commit()
    con.close()
    return vals


def poll_era():
    ss = get_substrate()
    era = ss.query("Staking", "CurrentEra", []).value
    con = sqlite3.connect(DB_PATH)
    con.execute(
        "INSERT OR IGNORE INTO eras (era, rewards, total_stake, time) VALUES (?, '0', '0', ?)",
        (era, int(time.time())),
    )
    con.commit()
    con.close()
    return era


def collector_loop():
    """Background loop: poll chain data continuously."""
    init_db()
    last_era = None
    while True:
        try:
            num = poll_block()
            vals = poll_validators()
            era = poll_era()
            if last_era is not None and era != last_era:
                con = sqlite3.connect(DB_PATH)
                con.execute(
                    "INSERT INTO alerts (time, kind, message) VALUES (?, 'era', ?)",
                    (int(time.time()), f"Era changed: {last_era} → {era}"),
                )
                con.commit()
                con.close()
            last_era = era
            print(f"[collector] block {num} | era {era} | validators {len(vals)}", flush=True)
        except Exception as e:
            print(f"[collector] error: {e}", flush=True)
            time.sleep(10)
        time.sleep(6)


if __name__ == "__main__":
    collector_loop()
