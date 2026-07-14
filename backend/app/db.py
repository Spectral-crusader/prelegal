"""SQLite access and schema setup.

One table and no ORM: the schema is small enough that stdlib sqlite3 is the
whole story. `init_db` runs on startup and is idempotent.
"""

import sqlite3
from pathlib import Path

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    """Open a connection with row access by column name."""
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path | None = None) -> None:
    """Create the schema. Called once per process on startup."""
    path = db_path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as conn:
        conn.executescript(SCHEMA)
