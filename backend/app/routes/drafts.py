"""Reading back what the user has drafted before.

Writing happens in the chat route, which is the only thing that produces a
draft. These two routes are the history list and reopening one.
"""

from fastapi import APIRouter, HTTPException

from .. import drafts
from ..auth import CurrentUser, User

router = APIRouter(prefix="/api")


@router.get("/drafts")
def list_drafts(user: User = CurrentUser) -> list[drafts.DraftSummary]:
    """The signed-in user's drafts, most recent first."""
    return drafts.list_for(user.id)


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: int, user: User = CurrentUser) -> drafts.Draft:
    """One draft, with its fields and conversation, ready to carry on."""
    draft = drafts.get(user.id, draft_id)
    # 404 rather than 403 for someone else's draft: telling them it exists but
    # is not theirs is more than they need to know.
    if draft is None:
        raise HTTPException(status_code=404, detail="no such draft")
    return draft
