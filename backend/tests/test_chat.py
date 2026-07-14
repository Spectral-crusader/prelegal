"""Tests for the AI intake chat.

The LLM itself is never called here: `run_turn` is stubbed at the route, and
the merge/validation logic is exercised directly. Tests stay offline and fast.
"""

import pytest
from fastapi.testclient import TestClient

from app import db
from app.chat import MndaFields, ChatReply, merge_fields
from app.main import app
from app.routes import api


def fields(**overrides) -> MndaFields:
    """An all-null MndaFields, with any named field set."""
    blank = dict.fromkeys(MndaFields.model_fields, None)
    return MndaFields.model_validate(blank | overrides)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")


@pytest.fixture
def client(temp_db):
    with TestClient(app) as c:
        yield c


# ---- merge ---------------------------------------------------------------


def test_merge_applies_new_values():
    merged = merge_fields(fields(purpose="Old"), fields(governing_law="Delaware"))
    assert merged.governing_law == "Delaware"
    assert merged.purpose == "Old"


def test_merge_null_does_not_clear_known_value():
    """Null means "learned nothing new", not "forget it"."""
    merged = merge_fields(fields(purpose="Evaluating a deal"), fields())
    assert merged.purpose == "Evaluating a deal"


def test_merge_lets_user_correct_an_earlier_answer():
    merged = merge_fields(fields(term_years=1), fields(term_years=5))
    assert merged.term_years == 5


# ---- date validation -----------------------------------------------------


def test_iso_date_is_kept():
    assert fields(effective_date="2026-07-15").effective_date == "2026-07-15"


def test_prose_date_is_discarded():
    """Prose would be printed onto the agreement verbatim by the renderer."""
    assert fields(effective_date="next Monday").effective_date is None


# ---- endpoint ------------------------------------------------------------


def test_chat_returns_reply_and_merged_fields(client, monkeypatch):
    def fake_turn(history, current, today):
        return ChatReply(
            message="Which state's law should govern?",
            fields=merge_fields(current, fields(purpose="Evaluating a partnership")),
        )

    monkeypatch.setattr(api, "run_turn", fake_turn)

    res = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "We're evaluating a partnership"}],
            "fields": fields(governing_law="Delaware").model_dump(by_alias=True),
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["message"] == "Which state's law should govern?"
    # Newly extracted field landed, and the pre-existing one survived.
    assert body["fields"]["purpose"] == "Evaluating a partnership"
    assert body["fields"]["governingLaw"] == "Delaware"


def test_chat_rejects_empty_transcript(client):
    res = client.post(
        "/api/chat",
        json={"messages": [], "fields": fields().model_dump(by_alias=True)},
    )
    assert res.status_code == 422


def test_chat_reports_missing_api_key(client, monkeypatch):
    def no_key(history, current, today):
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(api, "run_turn", no_key)

    res = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "fields": fields().model_dump(by_alias=True),
        },
    )
    assert res.status_code == 503
