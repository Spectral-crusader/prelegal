"""The AI intake chat for the Mutual NDA.

The user talks to the model in free text; each turn the model both replies and
extracts whatever deal terms it has learned so far. One LLM call does both, via
Structured Outputs, so the reply and the extracted fields can never disagree.

State lives in the browser: every request carries the full transcript and the
fields gathered so far, and this module is a pure function of them.
"""

import os
import re
from typing import Literal

from litellm import completion
from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}

# The fields the chat is trying to fill. Mirrors MndaFormValues in
# frontend/lib/types.ts, hence the camelCase aliases on the wire.
FIELD_GUIDE = """\
- purpose: why the parties are sharing information, as one sentence.
- effectiveDate: ISO yyyy-mm-dd ONLY. Resolve relative dates ("next Monday")
  against today's date, given below. Never emit prose here.
- termMode: "years" if the NDA expires after a fixed number of years,
  "until_terminated" if it runs until a party ends it.
- termYears: whole years, only when termMode is "years".
- confidentialityMode: "years" for a fixed period, "perpetuity" for forever.
- confidentialityYears: whole years, only when confidentialityMode is "years".
- governingLaw: a US state name alone, e.g. "Delaware". Not "Delaware law".
- jurisdiction: the courts' city or county and state, e.g.
  "New Castle County, Delaware".
- modifications: any changes to the standard terms; omit unless asked for.
"""

SYSTEM_PROMPT = """\
You are a legal intake assistant helping a user draft a Mutual Non-Disclosure
Agreement (MNDA) from the Common Paper standard template. Today is {today}.

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


class MndaFields(BaseModel):
    """Deal terms for the MNDA. Null means the user has not said yet.

    Every field is declared without a default so it lands in the JSON schema as
    required-and-nullable, which is what strict Structured Outputs needs.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # The two modes are Literals so the enum reaches the JSON schema and the
    # model cannot invent a value the renderer would not recognise.
    purpose: str | None
    effective_date: str | None
    term_mode: Literal["years", "until_terminated"] | None
    term_years: int | None
    confidentiality_mode: Literal["years", "perpetuity"] | None
    confidentiality_years: int | None
    governing_law: str | None
    jurisdiction: str | None
    modifications: str | None

    @field_validator("effective_date")
    @classmethod
    def _iso_only(cls, v: str | None) -> str | None:
        """Drop a date the renderer cannot format.

        The frontend prints this straight onto the agreement, so prose like
        "next Monday" would land in the document verbatim. Discarding it leaves
        the field unknown and the model asks again.
        """
        return v if v is None or ISO_DATE.match(v) else None


class Message(BaseModel):
    role: str
    content: str


class ChatReply(BaseModel):
    """What the model returns: what to say next, plus what it just learned."""

    message: str
    fields: MndaFields


def merge_fields(current: MndaFields, update: MndaFields) -> MndaFields:
    """Layer newly extracted values over what we already had.

    Null in the update means "the model learned nothing new about this field",
    never "clear it" — so nulls never overwrite a known value.
    """
    merged = current.model_dump()
    for name, value in update.model_dump().items():
        if value is not None:
            merged[name] = value
    return MndaFields.model_validate(merged)


def _build_messages(history: list[Message], current: MndaFields, today: str) -> list[dict]:
    system = SYSTEM_PROMPT.format(
        today=today,
        field_guide=FIELD_GUIDE,
        current=current.model_dump_json(by_alias=True, indent=2),
    )
    return [{"role": "system", "content": system}] + [m.model_dump() for m in history]


def run_turn(history: list[Message], current: MndaFields, today: str) -> ChatReply:
    """Advance the conversation by one turn and return the merged state."""
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    response = completion(
        model=MODEL,
        messages=_build_messages(history, current, today),
        response_format=ChatReply,
        # Not "low": at low effort the model reliably answers with a bare
        # acknowledgement and forgets to ask the next question, stranding the
        # user (measured 1/5 replies asked one, vs 5/5 at medium).
        reasoning_effort="medium",
        extra_body=EXTRA_BODY,
    )
    reply = ChatReply.model_validate_json(response.choices[0].message.content)
    return ChatReply(message=reply.message, fields=merge_fields(current, reply.fields))
