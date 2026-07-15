"""The AI intake chat.

Two kinds of turn, chosen by whether a document has been settled on yet:

  selection — work out which of the documents in the registry the user needs,
              or explain that we cannot draft what they asked for and offer the
              closest thing we can.
  intake    — learn that document's Variables through ordinary conversation.

Both are one LLM call returning Structured Outputs, so the reply and the
extracted state can never disagree. The intake schema is built from the
document's spec, so adding a document is a registry edit, not a code change.

State lives in the browser: every request carries the full transcript, the
chosen document and the fields gathered so far, and this module is a pure
function of them.
"""

import os

from litellm import completion
from pydantic import BaseModel

from . import documents
from .documents import CAMEL

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

SELECT_PROMPT = """\
You are a legal intake assistant. Today is {today}. Your only job right now is
to work out which document the user needs, from this list and nothing else:

{catalog}

How to behave:
- If what the user wants clearly matches one document, set documentId to its id
  and say in one sentence that you will draft it. Do not ask them to confirm a
  clear match.
- If it is ambiguous between two or three, leave documentId null and ask one
  question that separates them.
- If we cannot draft what they asked for, leave documentId null and say plainly
  that this tool cannot generate that document. Then decide whether anything on
  the list would actually serve the work they described:
    - If one would, name it, say in a few words why, and ask if they want it.
      Someone asking to paper a freelance engineer's engagement can genuinely be
      served by a Professional Services Agreement, so offer it.
    - If nothing would — the request belongs to a different area of law, such as
      property, family, immigration, or employing staff — say so and stop there.
      Do not reach for the nearest business contract. Telling someone a
      Professional Services Agreement can be adapted into a residential lease is
      worse than telling them we cannot help, because they might believe you.
- Never pretend an unsupported document is supported, and never set documentId
  to something the user has not agreed to.
- If they then agree to your suggestion, set documentId to it.
- Keep replies to a sentence or two, plain and warm.

You draft documents, you do not advise. If asked which document they ought to
use for a legal outcome, say you cannot give legal advice and that a lawyer
should review the draft, then continue.
"""

INTAKE_PROMPT = """\
You are a legal intake assistant helping a user draft a {document_name} from
the Common Paper standard template. Today is {today}.

Your job is to learn the deal terms through ordinary conversation and record
them as you go.

The fields you are filling:
{field_guide}

How to behave:
- Every reply must move the intake forward. Briefly acknowledge what you just
  heard, then ask about ONE still-unknown field. Never reply with only an
  acknowledgement — that strands the user with nothing to answer.
- Keep replies to a sentence or two, plain and warm. No bullet lists, no
  legalese, no restating everything you know.
- Set a field only when the user has actually told you. Leave everything else
  null. Never invent or assume a value, and never guess at what the user
  "probably" wants.
- The user may correct an earlier answer at any time; when they do, emit the
  new value for that field.
- Fields the user leaves unset are recorded as "not applicable" on the cover
  page, which the standard terms treat as "this clause does not apply". So it
  is fine to move on when someone says a field does not matter to them.
- When every field is settled, say so and tell them the preview on the right is
  ready to download. Do not ask further questions.

You draft documents, you do not advise. If the user asks what governing law to
pick or whether these terms are good for them, say plainly that you cannot give
legal advice and that a lawyer should review the draft, then continue the
intake. Never present a field value as a legal recommendation.

Fields recorded so far (null means not yet known). This snapshot is from BEFORE
the user's latest message, so fold in whatever they just told you:
{current}
"""


class Message(BaseModel):
    role: str
    content: str


class Selection(BaseModel):
    """What the selection turn returns: what to say, and the document if settled."""

    model_config = CAMEL

    message: str
    document_id: str | None


class Turn(BaseModel):
    """The result of advancing the conversation once."""

    model_config = CAMEL

    message: str
    document_id: str | None
    fields: dict


def _complete(system: str, history: list[Message], schema: type[BaseModel]) -> BaseModel:
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    response = completion(
        model=MODEL,
        messages=[{"role": "system", "content": system}] + [m.model_dump() for m in history],
        response_format=schema,
        # Not "low": at low effort the model reliably answers with a bare
        # acknowledgement and forgets to ask the next question, stranding the
        # user (measured 1/5 replies asked one, vs 5/5 at medium).
        reasoning_effort="medium",
        extra_body=EXTRA_BODY,
    )
    return schema.model_validate_json(response.choices[0].message.content)


def merge_fields(current: dict, update: dict) -> dict:
    """Layer newly extracted values over what we already had.

    Null in the update means "the model learned nothing new about this field",
    never "clear it" — so nulls never overwrite a known value.
    """
    merged = dict(current)
    for name, value in update.items():
        if value is not None:
            merged[name] = value
    return merged


def select(history: list[Message], today: str) -> Selection:
    """Work out which document the user needs, if it is knowable yet."""
    system = SELECT_PROMPT.format(today=today, catalog=documents.catalog_summary())
    reply = _complete(system, history, Selection)
    # The model occasionally answers with a document name rather than an id.
    # Anything we do not recognise means "not settled yet", which is the safe
    # reading — the intake would otherwise start on a document nobody chose.
    if reply.document_id and not documents.get(reply.document_id):
        return Selection(message=reply.message, document_id=None)
    return reply


def intake(history: list[Message], document_id: str, current: dict, today: str) -> Turn:
    """Advance the intake for a settled document and return the merged state."""
    spec = documents.BY_ID[document_id]
    model = documents.fields_model(document_id)
    known = model.model_validate(_blank(model) | current)

    system = INTAKE_PROMPT.format(
        today=today,
        document_name=spec.name,
        field_guide=documents.field_guide(document_id),
        current=known.model_dump_json(by_alias=True, indent=2),
    )
    reply = _complete(system, history, documents.reply_model(document_id))
    return Turn(
        message=reply.message,
        document_id=document_id,
        fields=merge_fields(known.model_dump(), reply.fields.model_dump()),
    )


def _blank(model: type[BaseModel]) -> dict:
    return dict.fromkeys(model.model_fields, None)


def run_turn(history: list[Message], document_id: str | None, current: dict, today: str) -> Turn:
    """Advance the conversation by one turn.

    Before a document is settled this selects one; the turn that settles it goes
    straight on to run the intake, so the same reply both confirms the choice and
    asks the first question — and anything the user already volunteered ("an NDA
    with Acme for our SOC 2 audit") is extracted rather than asked for again.
    That costs a second LLM call, on exactly one turn of the conversation.
    """
    if document_id:
        return intake(history, document_id, current, today)

    chosen = select(history, today)
    if not chosen.document_id:
        return Turn(message=chosen.message, document_id=None, fields={})
    return intake(history, chosen.document_id, {}, today)
