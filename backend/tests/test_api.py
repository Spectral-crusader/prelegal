import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the app at a throwaway database for each test."""
    path = tmp_path / "test.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


@pytest.fixture
def client(temp_db):
    with TestClient(app) as c:
        yield c


def test_health_reports_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "database": "ok"}


def test_health_needs_no_session(client):
    """The start scripts poll this before anyone has signed in."""
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize("table", ["users", "sessions", "drafts"])
def test_init_db_creates_table(temp_db, table):
    db.init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        ).fetchone()
    assert row is not None


def test_init_db_is_idempotent(temp_db):
    db.init_db(temp_db)
    db.init_db(temp_db)
    with sqlite3.connect(temp_db) as conn:
        count = conn.execute(
            "SELECT count(*) FROM sqlite_master WHERE name='users'"
        ).fetchone()[0]
    assert count == 1
