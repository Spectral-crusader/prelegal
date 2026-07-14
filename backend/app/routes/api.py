"""API routes.

PL-4 is a foundation ticket: these endpoints prove the stack is wired end to
end. Real authentication lands in a later ticket, so `/api/me` returns a fixed
placeholder rather than reading a session.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from ..db import connect

router = APIRouter(prefix="/api")


class Health(BaseModel):
    status: str
    database: str


class User(BaseModel):
    email: str
    authenticated: bool


@router.get("/health")
def health() -> Health:
    """Liveness probe, also used by the start scripts to wait for readiness."""
    with connect() as conn:
        conn.execute("SELECT 1 FROM users LIMIT 1")
    return Health(status="ok", database="ok")


@router.get("/me")
def me() -> User:
    """Placeholder identity. The login screen is fake until auth is built."""
    return User(email="demo@prelegal.local", authenticated=False)
