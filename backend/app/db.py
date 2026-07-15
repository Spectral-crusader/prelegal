"""SQLite access and schema setup.

Three tables and no ORM: the schema is small enough that stdlib sqlite3 is the
whole story. `init_db` runs on startup and is idempotent.

The database is recreated empty on every container start (it lives in the
writable layer), so there is no migration story here — the schema below is
simply what a fresh database gets. That also means accounts do not survive a
restart, which PL-7 accepts by design.
"""

import sqlite3
from pathlib import Path

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per document the user is drafting. `transcript_json` is stored
-- alongside the fields because chat is the only way to fill a document: without
-- the conversation, a reopened draft could be read but never continued.
CREATE TABLE IF NOT EXISTS drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id     TEXT NOT NULL,
    fields_json     TEXT NOT NULL,
    transcript_json TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS drafts_by_user ON drafts(user_id, updated_at DESC);
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
