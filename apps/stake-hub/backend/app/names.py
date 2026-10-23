
"""Validator nicknames — persistent, deterministic per address.

Portaldot validators have no on-chain identity yet. We assign
friendly persistent names (stored in SQLite) so users can tell
validators apart. When on-chain identity appears, it takes priority.
"""
import sqlite3
from app.collector import DB_PATH

NAME_POOL = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot",
    "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima",
]


def get_validator_name(address: str) -> str:
    con = sqlite3.connect(DB_PATH)
    row = con.execute(
        "SELECT nickname FROM validator_names WHERE address = ?", (address,)
    ).fetchone()
    if row:
        con.close()
        return row[0]
    # assign next available name deterministically by address order
    count = con.execute("SELECT COUNT(*) FROM validator_names").fetchone()[0]
    name = f"Validator {NAME_POOL[count % len(NAME_POOL)]}"
    con.execute(
        "INSERT OR IGNORE INTO validator_names (address, nickname) VALUES (?, ?)",
        (address, name),
    )
    con.commit()
    con.close()
    return name


def ensure_table():
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """CREATE TABLE IF NOT EXISTS validator_names (
            address TEXT PRIMARY KEY,
            nickname TEXT NOT NULL
        )"""
    )
    con.commit()
    con.close()
