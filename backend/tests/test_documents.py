"""Tests for the document registry.

The registry is data, so these guard the things a bad edit to documents.json
would break: schemas the LLM cannot satisfy, or labels that no longer match the
Variables in the templates they describe.
"""

import re
from pathlib import Path

import pytest

from app import documents
from app.config import REPO_ROOT

TEMPLATES = REPO_ROOT / "templates"

# The five span classes the corpus uses to mark a Variable.
VARIABLE_RE = re.compile(
    r'<span class="(?:keyterms|coverpage|orderform|businessterms|sow)_link"[^>]*>([^<]*)</span>'
)


def variables_in(filename: str) -> set[str]:
    """Every Variable named in a template, with possessive forms normalized."""
    text = (TEMPLATES / filename).read_text()
    return {re.sub(r"['’]s$", "", v) for v in VARIABLE_RE.findall(text)}


def test_registry_covers_every_catalog_template():
    """Each Markdown file in the corpus belongs to exactly one document."""
    used = {t for d in documents.REGISTRY.documents for t in d.templates}
    on_disk = {p.name for p in TEMPLATES.glob("*.md")}
    assert used == on_disk


def test_document_ids_are_unique():
    ids = [d.id for d in documents.REGISTRY.documents]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_templates_exist(spec):
    for name in spec.templates:
        assert (TEMPLATES / name).is_file()


@pytest.mark.parametrize(
    "spec",
    [d for d in documents.REGISTRY.documents if d.renderer == "generic"],
    ids=lambda s: s.id,
)
def test_generic_field_labels_name_real_variables(spec):
    """A label is what ties a Key Terms row to the prose that uses it.

    The generic renderer leaves Variables in the text and defines them on the
    cover page it synthesizes, so a label that matches no Variable in the
    template is a definition of something the document never mentions.
    """
    declared = set()
    for name in spec.templates:
        declared |= variables_in(name)
    labels = {f.label for f in spec.fields}
    assert labels <= declared, f"not Variables in {spec.templates}: {labels - declared}"


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_enum_fields_declare_options(spec):
    for f in spec.fields:
        assert (f.options is not None) == (f.type == "enum"), f.name


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_required_when_points_at_a_sibling(spec):
    names = {f.name for f in spec.fields}
    for f in spec.fields:
        if f.required_when:
            assert f.required_when.field in names, f.name


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_fields_model_is_all_nullable(spec):
    """Structured Outputs needs every field required-and-nullable.

    Null is also how the chat knows what it still has to ask about, so a field
    that cannot be null would be a field the model must invent a value for.
    """
    model = documents.fields_model(spec.id)
    assert set(model.model_fields) == {f.name for f in spec.fields}
    blank = model.model_validate(dict.fromkeys(model.model_fields, None))
    assert all(v is None for v in blank.model_dump().values())


def test_enum_options_reach_the_json_schema():
    schema = documents.fields_model("mutual-nda").model_json_schema()
    term_mode = schema["properties"]["termMode"]["anyOf"]
    assert {"years", "until_terminated"} == set(term_mode[0]["enum"])


def test_fields_model_serializes_camel_case():
    """The frontend keys its field map off these names."""
    model = documents.fields_model("mutual-nda")
    blank = model.model_validate(dict.fromkeys(model.model_fields, None))
    assert "effectiveDate" in blank.model_dump_json(by_alias=True)


def test_date_fields_discard_prose():
    """Prose would be printed onto the agreement verbatim by the renderer."""
    model = documents.fields_model("mutual-nda")
    blank = dict.fromkeys(model.model_fields, None)
    kept = model.model_validate(blank | {"effectiveDate": "2026-07-15"})
    assert kept.effectiveDate == "2026-07-15"
    dropped = model.model_validate(blank | {"effectiveDate": "next Monday"})
    assert dropped.effectiveDate is None


def test_catalog_summary_lists_every_document():
    summary = documents.catalog_summary()
    for d in documents.REGISTRY.documents:
        assert d.id in summary
        assert d.name in summary


def test_field_guide_covers_every_field():
    guide = documents.field_guide("pilot-agreement")
    for f in documents.get("pilot-agreement").fields:
        assert f.name in guide


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_field_guide_demands_iso_for_every_date(spec):
    """`_iso_only` discards a prose date silently.

    If the prompt does not demand ISO, a model that answers "August 1, 2026" has
    the value dropped with no error and asks again — a loop the user cannot get
    out of. The rule comes from the declared type so no guide has to remember it.
    """
    guide = documents.field_guide(spec.id)
    for f in spec.fields:
        if f.type == "date":
            line = next(x for x in guide.splitlines() if x.startswith(f"- {f.name}:"))
            assert "ISO yyyy-mm-dd" in line


@pytest.mark.parametrize("spec", documents.REGISTRY.documents, ids=lambda s: s.id)
def test_field_guide_spells_out_enum_options(spec):
    guide = documents.field_guide(spec.id)
    for f in spec.fields:
        if f.type == "enum":
            line = next(x for x in guide.splitlines() if x.startswith(f"- {f.name}:"))
            for option in f.options:
                assert option in line
