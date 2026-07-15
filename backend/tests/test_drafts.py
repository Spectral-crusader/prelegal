"""Tests for stored drafts.

The chat route is the only writer, so the save path is exercised through it with
the LLM stubbed out — same approach as test_chat.py.
"""

import pytest
from fastapi.testclient import TestClient

from app import db, drafts
from app.chat import Message, Turn
from app.main import app
from app.routes import api


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")


@pytest.fixture
def client(temp_db):
    with TestClient(app) as c:
        yield c


def sign_up(client, email="ada@example.com") -> int:
    res = client.post("/api/auth/signup", json={"email": email, "password": "a long password"})
    return res.json()["id"]


@pytest.fixture
def user(client) -> int:
    return sign_up(client)


def stub_turn(monkeypatch, message="Which state's law should govern?", **fields):
    """Make the chat route return a settled Mutual NDA turn."""

    def fake_turn(history, document_id, current, today):
        return Turn(message=message, document_id="mutual-nda", fields=dict(current) | fields)

    monkeypatch.setattr(api, "run_turn", fake_turn)


def say(client, text, **body):
    return client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": text}], **body}
    )


# ---- storage -------------------------------------------------------------


def test_save_then_get_round_trips(user):
    transcript = [Message(role="user", content="an NDA"), Message(role="assistant", content="Sure.")]
    draft_id = drafts.save(user, None, "mutual-nda", {"purpose": "Audit"}, transcript)

    draft = drafts.get(user, draft_id)
    assert draft.fields == {"purpose": "Audit"}
    assert draft.transcript == transcript


def test_save_with_an_id_updates_rather_than_inserts(user):
    first = drafts.save(user, None, "mutual-nda", {}, [])
    second = drafts.save(user, first, "mutual-nda", {"purpose": "Audit"}, [])

    assert second == first
    assert len(drafts.list_for(user)) == 1
    assert drafts.get(user, first).fields == {"purpose": "Audit"}


def test_document_name_comes_from_the_registry(user):
    draft_id = drafts.save(user, None, "mutual-nda", {}, [])
    assert drafts.get(user, draft_id).document_name == "Mutual Non-Disclosure Agreement"


def test_list_is_most_recent_first(user):
    old = drafts.save(user, None, "mutual-nda", {}, [])
    new = drafts.save(user, None, "pilot-agreement", {}, [])
    # Same-second timestamps are realistic here, hence the id tiebreak.
    assert [d.id for d in drafts.list_for(user)] == [new, old]


def test_list_is_empty_for_a_new_account(user):
    assert drafts.list_for(user) == []


# ---- isolation between users --------------------------------------------


def test_one_users_drafts_stay_out_of_anothers_list(client, user):
    drafts.save(user, None, "mutual-nda", {}, [])
    other = sign_up(client, "grace@example.com")

    assert drafts.list_for(other) == []


def test_a_draft_cannot_be_read_by_another_user(client, user):
    draft_id = drafts.save(user, None, "mutual-nda", {"purpose": "Secret"}, [])
    other = sign_up(client, "grace@example.com")

    assert drafts.get(other, draft_id) is None


def test_a_draft_cannot_be_overwritten_by_another_user(client, user):
    draft_id = drafts.save(user, None, "mutual-nda", {"purpose": "Mine"}, [])
    other = sign_up(client, "grace@example.com")

    # Passing someone else's id must not write over their work; it makes a new
    # draft of the attacker's own instead.
    written = drafts.save(other, draft_id, "mutual-nda", {"purpose": "Theirs"}, [])
    assert written != draft_id
    assert drafts.get(user, draft_id).fields == {"purpose": "Mine"}


# ---- the chat route as the writer ---------------------------------------


def test_a_turn_saves_a_draft(client, user, monkeypatch):
    stub_turn(monkeypatch, purpose="Evaluating a partnership")

    res = say(client, "We're evaluating a partnership", documentId="mutual-nda")
    assert res.status_code == 200
    draft_id = res.json()["draftId"]
    assert draft_id is not None

    stored = drafts.get(user, draft_id)
    assert stored.fields["purpose"] == "Evaluating a partnership"


def test_the_saved_transcript_includes_the_reply(client, user, monkeypatch):
    """A restored draft must end on the assistant's question, not the user's
    message — otherwise the user reopens it with nothing to answer."""
    stub_turn(monkeypatch, message="Which state's law should govern?")

    draft_id = say(client, "We're evaluating a partnership", documentId="mutual-nda").json()["draftId"]

    transcript = drafts.get(user, draft_id).transcript
    assert transcript[-1].role == "assistant"
    assert transcript[-1].content == "Which state's law should govern?"


def test_successive_turns_update_one_draft(client, user, monkeypatch):
    stub_turn(monkeypatch, purpose="Audit")
    first = say(client, "an NDA for our audit", documentId="mutual-nda").json()["draftId"]

    stub_turn(monkeypatch, governingLaw="Delaware")
    second = say(
        client, "Delaware", documentId="mutual-nda", draftId=first, fields={"purpose": "Audit"}
    ).json()["draftId"]

    assert second == first
    assert len(drafts.list_for(user)) == 1


def test_a_turn_with_no_document_yet_saves_nothing(client, user, monkeypatch):
    """There is nothing to save until we know what is being drafted."""

    def undecided(history, document_id, current, today):
        return Turn(message="What are you putting together?", document_id=None, fields={})

    monkeypatch.setattr(api, "run_turn", undecided)

    res = say(client, "hi")
    assert res.json()["draftId"] is None
    assert drafts.list_for(user) == []


# ---- the endpoints -------------------------------------------------------


def test_list_endpoint_returns_the_users_drafts(client, user):
    drafts.save(user, None, "mutual-nda", {}, [])

    res = client.get("/api/drafts")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert body[0]["documentName"] == "Mutual Non-Disclosure Agreement"


def test_get_endpoint_returns_fields_and_transcript(client, user):
    draft_id = drafts.save(
        user, None, "mutual-nda", {"purpose": "Audit"}, [Message(role="user", content="an NDA")]
    )

    body = client.get(f"/api/drafts/{draft_id}").json()
    assert body["fields"] == {"purpose": "Audit"}
    assert body["transcript"] == [{"role": "user", "content": "an NDA"}]


def test_get_endpoint_404s_for_another_users_draft(client, user):
    draft_id = drafts.save(user, None, "mutual-nda", {}, [])
    client.post("/api/auth/signout")
    sign_up(client, "grace@example.com")

    assert client.get(f"/api/drafts/{draft_id}").status_code == 404


def test_get_endpoint_404s_for_a_draft_that_does_not_exist(client, user):
    assert client.get("/api/drafts/999").status_code == 404


# ---- these endpoints are signed-in only ---------------------------------


@pytest.mark.parametrize("path", ["/api/drafts", "/api/drafts/1"])
def test_draft_endpoints_require_a_session(client, path):
    assert client.get(path).status_code == 401


def test_chat_requires_a_session(client):
    """Every turn spends money at OpenRouter, so anonymous callers stop here."""
    assert say(client, "hi").status_code == 401
