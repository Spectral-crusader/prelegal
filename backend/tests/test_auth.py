"""Tests for accounts and sessions."""

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.main import app

CREDS = {"email": "ada@example.com", "password": "correct horse battery"}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")


@pytest.fixture
def client(temp_db):
    with TestClient(app) as c:
        yield c


# ---- hashing -------------------------------------------------------------


def test_password_round_trips():
    stored = auth.hash_password("hunter2hunter2")
    assert auth.verify_password("hunter2hunter2", stored)


def test_wrong_password_is_rejected():
    stored = auth.hash_password("hunter2hunter2")
    assert not auth.verify_password("hunter3hunter3", stored)


def test_hash_is_salted():
    """Two accounts on the same password must not share a digest."""
    assert auth.hash_password("same password") != auth.hash_password("same password")


def test_password_is_not_stored_in_the_clear(client):
    client.post("/api/auth/signup", json=CREDS)
    with db.connect() as conn:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
    assert CREDS["password"] not in stored


# ---- signup --------------------------------------------------------------


def test_signup_creates_an_account_and_signs_in(client):
    res = client.post("/api/auth/signup", json=CREDS)
    assert res.status_code == 201
    assert res.json()["email"] == CREDS["email"]
    # The cookie came back, so the browser is signed in without a second step.
    assert auth.COOKIE in res.cookies
    assert client.get("/api/me").status_code == 200


def test_signup_rejects_a_duplicate_email(client):
    client.post("/api/auth/signup", json=CREDS)
    res = client.post("/api/auth/signup", json=CREDS)
    assert res.status_code == 409


def test_signup_rejects_a_short_password(client):
    res = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "short"})
    assert res.status_code == 422


def test_signup_rejects_a_malformed_email(client):
    res = client.post("/api/auth/signup", json={"email": "not-an-email", "password": "longenough"})
    assert res.status_code == 422


# ---- signin --------------------------------------------------------------


def test_signin_with_the_right_password(client):
    client.post("/api/auth/signup", json=CREDS)
    client.cookies.clear()
    res = client.post("/api/auth/signin", json=CREDS)
    assert res.status_code == 200
    assert client.get("/api/me").json()["email"] == CREDS["email"]


def test_signin_with_the_wrong_password(client):
    client.post("/api/auth/signup", json=CREDS)
    client.cookies.clear()
    res = client.post("/api/auth/signin", json={**CREDS, "password": "wrong password"})
    assert res.status_code == 401


def test_signin_for_an_unknown_email(client):
    res = client.post("/api/auth/signin", json=CREDS)
    assert res.status_code == 401


def test_unknown_email_and_wrong_password_are_indistinguishable(client):
    """Neither response may reveal whether an address has an account here."""
    client.post("/api/auth/signup", json=CREDS)
    client.cookies.clear()
    wrong = client.post("/api/auth/signin", json={**CREDS, "password": "wrong password"})
    unknown = client.post("/api/auth/signin", json={"email": "nobody@example.com", "password": "wrong password"})
    assert wrong.status_code == unknown.status_code
    assert wrong.json() == unknown.json()


# ---- me and signout ------------------------------------------------------


def test_me_is_401_without_a_session(client):
    assert client.get("/api/me").status_code == 401


def test_me_is_401_for_a_bogus_token(client):
    client.cookies.set(auth.COOKIE, "not-a-real-token")
    assert client.get("/api/me").status_code == 401


def test_signout_ends_the_session(client):
    client.post("/api/auth/signup", json=CREDS)
    assert client.post("/api/auth/signout").status_code == 204
    assert client.get("/api/me").status_code == 401


def test_signout_revokes_the_token_server_side(client):
    """Deleting the row is the point of a sessions table — a client that kept
    the cookie must still be locked out."""
    signup = client.post("/api/auth/signup", json=CREDS)
    token = signup.cookies[auth.COOKIE]
    client.post("/api/auth/signout")

    client.cookies.set(auth.COOKIE, token)
    assert client.get("/api/me").status_code == 401


def test_signout_without_a_session_is_harmless(client):
    assert client.post("/api/auth/signout").status_code == 204
