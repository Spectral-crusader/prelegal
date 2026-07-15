"""Tests for the AI chat.

The LLM itself is never called here: `_complete` is stubbed, and the merge and
routing logic is exercised directly. Tests stay offline and fast.
"""

import pytest
from fastapi.testclient import TestClient

from app import chat, db, documents
from app.chat import Message, Selection, Turn, merge_fields
from app.main import app
from app.routes import api


def blank(document_id: str, **overrides) -> dict:
    """An all-null field map for a document, with any named field set."""
    model = documents.fields_model(document_id)
    return dict.fromkeys(model.model_fields, None) | overrides


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")


@pytest.fixture
def client(temp_db):
    with TestClient(app) as c:
        yield c


def stub_completion(monkeypatch, *replies):
    """Answer each successive LLM call with the next canned reply."""
    remaining = list(replies)

    def fake(system, history, schema):
        return remaining.pop(0)

    monkeypatch.setattr(chat, "_complete", fake)


def intake_reply(document_id: str, message: str, **fields):
    model = documents.reply_model(document_id)
    return model.model_validate({"message": message, "fields": blank(document_id, **fields)})


# ---- merge ---------------------------------------------------------------


def test_merge_applies_new_values():
    merged = merge_fields({"purpose": "Old"}, {"governingLaw": "Delaware"})
    assert merged["governingLaw"] == "Delaware"
    assert merged["purpose"] == "Old"


def test_merge_null_does_not_clear_known_value():
    """Null means "learned nothing new", not "forget it"."""
    merged = merge_fields({"purpose": "Evaluating a deal"}, {"purpose": None})
    assert merged["purpose"] == "Evaluating a deal"


def test_merge_lets_user_correct_an_earlier_answer():
    merged = merge_fields({"termYears": 1}, {"termYears": 5})
    assert merged["termYears"] == 5


# ---- selection -----------------------------------------------------------


def test_selection_routes_to_a_document(monkeypatch):
    stub_completion(
        monkeypatch,
        Selection(message="I'll draft a Mutual NDA.", document_id="mutual-nda"),
        intake_reply("mutual-nda", "What are you sharing?"),
    )
    turn = chat.run_turn([Message(role="user", content="I need an NDA")], None, {}, "2026-07-15")
    assert turn.document_id == "mutual-nda"


def test_settling_on_a_document_asks_the_first_question(monkeypatch):
    """The turn that picks a document runs the intake too, so the reply both
    confirms the choice and moves the conversation forward."""
    stub_completion(
        monkeypatch,
        Selection(message="I'll draft a Mutual NDA.", document_id="mutual-nda"),
        intake_reply("mutual-nda", "What are you sharing?", purpose="A SOC 2 audit"),
    )
    turn = chat.run_turn(
        [Message(role="user", content="an NDA for our SOC 2 audit")], None, {}, "2026-07-15"
    )
    assert turn.message == "What are you sharing?"
    # And what the user already volunteered was extracted, not asked for again.
    assert turn.fields["purpose"] == "A SOC 2 audit"


def test_unsettled_selection_does_not_start_an_intake(monkeypatch):
    """An unsupported request gets an explanation, not a document."""
    stub_completion(
        monkeypatch,
        Selection(
            message="I can't draft an employment contract. The closest I have is a "
            "Professional Services Agreement — want that?",
            document_id=None,
        ),
    )
    turn = chat.run_turn(
        [Message(role="user", content="employment contract")], None, {}, "2026-07-15"
    )
    assert turn.document_id is None
    assert turn.fields == {}


def test_unknown_document_id_from_the_model_is_ignored(monkeypatch):
    """The model sometimes answers with a name rather than an id. Starting an
    intake on a document nobody chose is worse than asking again."""
    stub_completion(
        monkeypatch,
        Selection(message="Sure.", document_id="Employment Contract"),
    )
    turn = chat.run_turn([Message(role="user", content="hi")], None, {}, "2026-07-15")
    assert turn.document_id is None


def test_settled_document_skips_selection(monkeypatch):
    """Once a document is chosen every turn is an intake turn — one LLM call."""
    stub_completion(monkeypatch, intake_reply("pilot-agreement", "How long is the pilot?"))
    turn = chat.run_turn(
        [Message(role="user", content="Acme is the customer")],
        "pilot-agreement",
        blank("pilot-agreement"),
        "2026-07-15",
    )
    assert turn.document_id == "pilot-agreement"
    assert turn.message == "How long is the pilot?"


# ---- endpoint ------------------------------------------------------------


def test_chat_returns_reply_and_merged_fields(client, monkeypatch):
    def fake_turn(history, document_id, current, today):
        return Turn(
            message="Which state's law should govern?",
            document_id="mutual-nda",
            fields=merge_fields(current, {"purpose": "Evaluating a partnership"}),
        )

    monkeypatch.setattr(api, "run_turn", fake_turn)

    res = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "We're evaluating a partnership"}],
            "documentId": "mutual-nda",
            "fields": blank("mutual-nda", governingLaw="Delaware"),
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["message"] == "Which state's law should govern?"
    assert body["documentId"] == "mutual-nda"
    # Newly extracted field landed, and the pre-existing one survived.
    assert body["fields"]["purpose"] == "Evaluating a partnership"
    assert body["fields"]["governingLaw"] == "Delaware"


def test_chat_accepts_a_turn_with_no_document_yet(client, monkeypatch):
    def fake_turn(history, document_id, current, today):
        assert document_id is None
        return Turn(message="What are you putting together?", document_id=None, fields={})

    monkeypatch.setattr(api, "run_turn", fake_turn)

    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 200
    assert res.json()["documentId"] is None


def test_chat_rejects_empty_transcript(client):
    res = client.post("/api/chat", json={"messages": [], "documentId": None, "fields": {}})
    assert res.status_code == 422


def test_chat_rejects_unknown_document(client):
    res = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "documentId": "employment-contract",
            "fields": {},
        },
    )
    assert res.status_code == 404


def test_chat_reports_missing_api_key(client, monkeypatch):
    def no_key(history, document_id, current, today):
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    monkeypatch.setattr(api, "run_turn", no_key)

    res = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "fields": {}},
    )
    assert res.status_code == 503


# ---- registry endpoint ---------------------------------------------------


def test_documents_endpoint_lists_the_registry(client):
    res = client.get("/api/documents")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == len(documents.REGISTRY.documents)
    mnda = next(d for d in body if d["id"] == "mutual-nda")
    assert mnda["renderer"] == "mnda"
    assert mnda["templates"] == ["Mutual-NDA-coverpage.md", "Mutual-NDA.md"]
    # camelCase reaches the browser, including the conditional-requirement rule.
    term_years = next(f for f in mnda["fields"] if f["name"] == "termYears")
    assert term_years["requiredWhen"] == {"field": "termMode", "equals": "years"}
