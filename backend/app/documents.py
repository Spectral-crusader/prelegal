"""The document registry: which agreements prelegal can draft, and what the
intake chat needs to learn for each.

Loaded from documents.json at import time. Each document's fields are turned
into a Pydantic model on demand, which is what gives the chat a strict JSON
schema per document without hand-writing eleven of them.
"""

import json
import re
from functools import cache
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, create_model
from pydantic.alias_generators import to_camel

from .config import DOCUMENTS_PATH

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# camelCase on the wire, snake_case in Python — the frontend's convention wins
# at the boundary.
CAMEL = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RequiredWhen(BaseModel):
    """Makes a field required only when a sibling holds a given value.

    The MNDA's term length matters only if the term is measured in years. Without
    this the renderer's fallback would quietly issue a 1-year NDA to someone who
    chose a fixed term but never said how long.
    """

    model_config = CAMEL

    field: str
    equals: str


class FieldSpec(BaseModel):
    """One Variable the intake chat tries to learn.

    `label` is the Variable's name as it appears in the template — the generic
    renderer keys its Key Terms table off it, so the two must match.
    """

    model_config = CAMEL

    name: str
    label: str
    guide: str
    type: Literal["string", "integer", "date", "enum"]
    options: list[str] | None = None
    required: bool
    required_when: RequiredWhen | None = None


class DocumentSpec(BaseModel):
    model_config = CAMEL

    id: str
    name: str
    description: str
    aliases: list[str]
    renderer: Literal["mnda", "generic"]
    templates: list[str]
    fields: list[FieldSpec]


class Registry(BaseModel):
    documents: list[DocumentSpec]


def _load() -> Registry:
    raw = json.loads(DOCUMENTS_PATH.read_text())
    return Registry.model_validate(raw)


REGISTRY = _load()
BY_ID = {d.id: d for d in REGISTRY.documents}


def get(document_id: str) -> DocumentSpec | None:
    return BY_ID.get(document_id)


def _iso_only(v: str | None) -> str | None:
    """Drop a date the renderer cannot format.

    The frontend prints this straight onto the agreement, so prose like "next
    Monday" would land in the document verbatim. Discarding it leaves the field
    unknown and the model asks again.
    """
    return v if v is None or ISO_DATE.match(v) else None


def _annotation(spec: FieldSpec):
    """The Python type for one field, always nullable.

    Enums reach the JSON schema as a Literal so the model cannot invent a value
    the renderer would not recognise. Dates carry a validator that discards
    prose.
    """
    if spec.type == "integer":
        return int | None
    if spec.type == "enum":
        return Literal[tuple(spec.options)] | None  # type: ignore[misc]
    if spec.type == "date":
        return Annotated[str | None, AfterValidator(_iso_only)]
    return str | None


@cache
def fields_model(document_id: str) -> type[BaseModel]:
    """A Pydantic model for one document's fields, built from its spec.

    Every field is declared without a default so it lands in the JSON schema as
    required-and-nullable, which is what strict Structured Outputs needs. Null
    means the user has not said yet.

    Cached because the model is immutable and building it is pure overhead on
    every turn.
    """
    spec = BY_ID[document_id]
    definitions = {f.name: (_annotation(f), ...) for f in spec.fields}
    return create_model(
        f"{_class_name(spec.id)}Fields",
        __config__=ConfigDict(alias_generator=to_camel, populate_by_name=True),
        **definitions,
    )


@cache
def reply_model(document_id: str) -> type[BaseModel]:
    """The intake turn's Structured Outputs schema: what to say, plus what it learned."""
    return create_model(
        f"{_class_name(document_id)}Reply",
        message=(str, ...),
        fields=(fields_model(document_id), ...),
    )


def _class_name(document_id: str) -> str:
    return "".join(part.capitalize() for part in document_id.split("-"))


# What a field's declared type obliges the model to emit. Derived from the type
# rather than left to each guide to remember: the date rule especially, because
# `_iso_only` discards a prose date *silently*, so a model that forgets would
# strand the user re-answering a question that never sticks.
_TYPE_RULES = {
    "date": 'ISO yyyy-mm-dd ONLY. Resolve relative dates ("next Monday") against '
    "today's date, given above. Never emit prose here.",
    "integer": "A whole number.",
}


def field_guide(document_id: str) -> str:
    """The field list as prompt text, one bullet per Variable."""
    lines = []
    for f in BY_ID[document_id].fields:
        rule = _TYPE_RULES.get(f.type, "")
        if f.type == "enum":
            rule = f"One of: {', '.join(f.options)}."
        lines.append(f"- {f.name}: {f.guide}{' ' + rule if rule else ''}")
    return "\n".join(lines)


def catalog_summary() -> str:
    """The documents we support, as prompt text for the selection turn."""
    lines = []
    for d in REGISTRY.documents:
        aliases = ", ".join(d.aliases)
        lines.append(f"- {d.id}: {d.name}. {d.description} Also called: {aliases}.")
    return "\n".join(lines)
