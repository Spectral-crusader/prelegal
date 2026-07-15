"""Accounts and sessions.

Passwords are hashed with `hashlib.scrypt` from the standard library, which
keeps a password-hashing dependency out of the project. Sessions are opaque
random tokens in a table rather than signed tokens: a row is something
`signout` can actually delete, where a self-contained token would stay valid
until it expired.

`current_user` is the dependency every protected route hangs off.
"""

import hashlib
import secrets
import sqlite3

from fastapi import Cookie, Depends, HTTPException
from pydantic import BaseModel

from .db import connect

COOKIE = "prelegal_session"

# scrypt's cost. The RFC 7914 baseline, and roughly 100ms per hash here — enough
# to matter against an offline attack, cheap enough for a sign-in to feel instant.
_N, _R, _P = 2**14, 8, 1


class User(BaseModel):
    id: int
    email: str


def hash_password(password: str) -> str:
    """A salted scrypt digest, salt and all, as one storable string."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P
    )
    # Constant-time: a plain `==` leaks the digest one byte at a time.
    return secrets.compare_digest(digest.hex(), digest_hex)


def create_user(email: str, password: str) -> User:
    """Register an account. Raises ValueError if the email is taken."""
    with connect() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, hash_password(password)),
            )
        except sqlite3.IntegrityError:
            raise ValueError("that email is already registered") from None
    return User(id=cur.lastrowid, email=email)


def authenticate(email: str, password: str) -> User | None:
    """The user, if the password is theirs."""
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return None
    return User(id=row["id"], email=row["email"])


def start_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    return token


def end_session(token: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def user_for_token(token: str | None) -> User | None:
    if not token:
        return None
    with connect() as conn:
        row = conn.execute(
            "SELECT users.id, users.email FROM sessions"
            " JOIN users ON users.id = sessions.user_id"
            " WHERE sessions.token = ?",
            (token,),
        ).fetchone()
    return User(id=row["id"], email=row["email"]) if row else None


def current_user(prelegal_session: str | None = Cookie(default=None)) -> User:
    """Require a signed-in user. 401 otherwise."""
    user = user_for_token(prelegal_session)
    if user is None:
        raise HTTPException(status_code=401, detail="not signed in")
    return user


# What a protected route annotates with. Named for readability at the call site.
CurrentUser = Depends(current_user)
