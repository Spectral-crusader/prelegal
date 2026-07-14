"""API routes.

`/api/health` and `/api/me` come from PL-4, the foundation ticket, and prove the
stack is wired end to end. Real authentication lands in a later ticket, so
`/api/me` returns a fixed placeholder rather than reading a session.

`/api/chat` (PL-5) drives the AI intake for the Mutual NDA.
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..chat import ChatReply, Message, MndaFields, run_turn
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


class ChatRequest(BaseModel):
    """A turn of the intake chat.

    Stateless by design: the browser owns the transcript and the fields so far,
    and sends both. Nothing is stored server-side.
    """

    messages: list[Message]
    fields: MndaFields


@router.post("/chat")
def chat(req: ChatRequest) -> ChatReply:
    """Advance the NDA intake conversation by one turn."""
    if not req.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")
    try:
        return run_turn(req.messages, req.fields, today=date.today().isoformat())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
