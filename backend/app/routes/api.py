"""API routes.

`/api/health` comes from PL-4, the foundation ticket, and proves the stack is
wired end to end. Sign-in and `/api/me` live in routes/auth.py.

`/api/chat` drives the AI conversation: picking a document (PL-6), then the
intake for it (PL-5). `/api/documents` is the registry the frontend renders
from.
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import documents, drafts
from ..auth import CurrentUser, User
from ..chat import CAMEL, Message, Turn, run_turn
from ..db import connect

router = APIRouter(prefix="/api")


class Health(BaseModel):
    status: str
    database: str


@router.get("/health")
def health() -> Health:
    """Liveness probe, also used by the start scripts to wait for readiness."""
    with connect() as conn:
        conn.execute("SELECT 1 FROM users LIMIT 1")
    return Health(status="ok", database="ok")


@router.get("/documents")
def list_documents() -> list[documents.DocumentSpec]:
    """Every document we can draft. The frontend renders and validates from this."""
    return documents.REGISTRY.documents


class ChatRequest(BaseModel):
    """A turn of the chat.

    The browser owns the live conversation — it sends the transcript, the chosen
    document and the fields so far, and the turn is computed purely from them.
    What the browser does not own is durability: the turn is also written to the
    user's draft, so a reload resumes rather than restarts.

    `documentId` is null until the conversation has settled on a document, and
    `draftId` is null until the first save.
    """

    model_config = CAMEL

    messages: list[Message]
    document_id: str | None = None
    draft_id: int | None = None
    fields: dict = {}


class ChatResponse(Turn):
    """The turn, plus where it was saved.

    Null `draftId` means nothing was saved because no document is settled yet —
    there is no draft to write until we know what is being drafted.
    """

    draft_id: int | None = None


@router.post("/chat")
def chat(req: ChatRequest, user: User = CurrentUser) -> ChatResponse:
    """Advance the conversation by one turn, and save it.

    Signed-in only: every turn spends real money at OpenRouter, so an anonymous
    caller must not be able to reach the model.
    """
    if not req.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")
    if req.document_id and not documents.get(req.document_id):
        raise HTTPException(status_code=404, detail=f"unknown document {req.document_id}")
    try:
        turn = run_turn(
            req.messages, req.document_id, req.fields, today=date.today().isoformat()
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not turn.document_id:
        return ChatResponse(**turn.model_dump(), draft_id=None)

    # The reply we just produced is part of the conversation, so it is stored
    # with it. Appending here rather than waiting for the browser to send it
    # back next turn means the last question survives a reload — otherwise a
    # restored draft would end on the user's message with nothing to answer.
    transcript = list(req.messages) + [Message(role="assistant", content=turn.message)]
    draft_id = drafts.save(
        user.id, req.draft_id, turn.document_id, turn.fields, transcript
    )
    return ChatResponse(**turn.model_dump(), draft_id=draft_id)
