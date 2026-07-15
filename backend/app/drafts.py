"""Stored drafts: what each user has been working on.

A draft is one document in progress — which document it is, the fields gathered
so far, and the conversation that gathered them. The chat writes one on every
turn once a document has been settled on, so a reload or a sign-out never loses
work.

Every read takes a `user_id` and filters on it. That is what keeps one user's
drafts out of another's list, so there is no unscoped query in this module by
design.
"""

import json

from pydantic import BaseModel

from . import documents
from .chat import Message
from .db import connect
from .documents import CAMEL


class DraftSummary(BaseModel):
    """One row of the history list."""

    model_config = CAMEL

    id: int
    document_id: str
    # Resolved from the registry rather than stored: the registry is the source
    # of truth for a document's name, and a stored copy would go stale the day
    # one is renamed.
    document_name: str
    updated_at: str


class Draft(DraftSummary):
    """A draft with everything needed to carry on filling it in."""

    fields: dict
    transcript: list[Message]


def _name(document_id: str) -> str:
    spec = documents.get(document_id)
    return spec.name if spec else document_id


def save(
    user_id: int,
    draft_id: int | None,
    document_id: str,
    fields: dict,
    transcript: list[Message],
) -> int:
    """Create or update a draft, returning its id.

    The update is scoped by user_id as well as draft_id, so passing someone
    else's draft id writes nothing rather than overwriting their work.
    """
    payload = (json.dumps(fields), json.dumps([m.model_dump() for m in transcript]))
    with connect() as conn:
        if draft_id is not None:
            cur = conn.execute(
                "UPDATE drafts SET fields_json = ?, transcript_json = ?,"
                " updated_at = datetime('now') WHERE id = ? AND user_id = ?",
                (*payload, draft_id, user_id),
            )
            if cur.rowcount:
                return draft_id
        cur = conn.execute(
            "INSERT INTO drafts (user_id, document_id, fields_json, transcript_json)"
            " VALUES (?, ?, ?, ?)",
            (user_id, document_id, *payload),
        )
        return cur.lastrowid


def list_for(user_id: int) -> list[DraftSummary]:
    """Every draft the user has, most recently worked on first."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, document_id, updated_at FROM drafts"
            " WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
            (user_id,),
        ).fetchall()
    return [
        DraftSummary(
            id=r["id"],
            document_id=r["document_id"],
            document_name=_name(r["document_id"]),
            updated_at=r["updated_at"],
        )
        for r in rows
    ]


def get(user_id: int, draft_id: int) -> Draft | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT id, document_id, fields_json, transcript_json, updated_at"
            " FROM drafts WHERE id = ? AND user_id = ?",
            (draft_id, user_id),
        ).fetchone()
    if row is None:
        return None
    return Draft(
        id=row["id"],
        document_id=row["document_id"],
        document_name=_name(row["document_id"]),
        updated_at=row["updated_at"],
        fields=json.loads(row["fields_json"]),
        transcript=[Message(**m) for m in json.loads(row["transcript_json"])],
    )
