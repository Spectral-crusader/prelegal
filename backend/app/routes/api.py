"""API routes.

`/api/health` and `/api/me` come from PL-4, the foundation ticket, and prove the
stack is wired end to end. Real authentication lands in a later ticket, so
`/api/me` returns a fixed placeholder rather than reading a session.

`/api/chat` drives the AI conversation: picking a document (PL-6), then the
intake for it (PL-5). `/api/documents` is the registry the frontend renders
from.
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import documents
from ..chat import CAMEL, Message, Turn, run_turn
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


@router.get("/documents")
def list_documents() -> list[documents.DocumentSpec]:
    """Every document we can draft. The frontend renders and validates from this."""
    return documents.REGISTRY.documents


class ChatRequest(BaseModel):
    """A turn of the chat.

    Stateless by design: the browser owns the transcript, the chosen document
    and the fields so far, and sends all three. Nothing is stored server-side.

    `documentId` is null until the conversation has settled on a document.
    """

    model_config = CAMEL

    messages: list[Message]
    document_id: str | None = None
    fields: dict = {}


@router.post("/chat")
def chat(req: ChatRequest) -> Turn:
    """Advance the conversation by one turn."""
    if not req.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")
    if req.document_id and not documents.get(req.document_id):
        raise HTTPException(status_code=404, detail=f"unknown document {req.document_id}")
    try:
        return run_turn(
            req.messages, req.document_id, req.fields, today=date.today().isoformat()
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
