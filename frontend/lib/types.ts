// The document registry, mirrored from documents.json via GET /api/documents,
// plus the two field shapes the renderers consume.
//
// Two shapes, deliberately distinct:
//
//   Fields      — what the user has actually told the AI. Null means "not yet
//                 known", which is what lets the AI decide what to ask next.
//                 This is what crosses the wire to /api/chat.
//   FormValues  — a fully-populated document, what the renderers consume.
//
// `toFormValues` is the one bridge between them, filling unknowns with
// placeholders so the preview can render a partial draft.

export type FieldType = 'string' | 'integer' | 'date' | 'enum';

// Makes a field required only when a sibling holds a given value. The MNDA's
// term length matters only if the term is measured in years.
export type RequiredWhen = { field: string; equals: string };

export type FieldSpec = {
  name: string;
  // The Variable's name as it appears in the template. The generic renderer
  // keys its Key Terms table off this, so the two must match.
  label: string;
  guide: string;
  type: FieldType;
  options?: string[] | null;
  required: boolean;
  requiredWhen?: RequiredWhen | null;
};

export type DocumentSpec = {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  renderer: 'mnda' | 'generic';
  templates: string[];
  fields: FieldSpec[];
};

// Keyed by FieldSpec.name. Null means the user has not said yet.
export type Fields = Record<string, string | number | null>;

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// ---- the Mutual NDA's shape ------------------------------------------------
//
// The MNDA keeps a bespoke renderer (it is the only document in the corpus with
// a real cover page, with checkbox options the generic renderer has no notion
// of), so it keeps a typed view of its fields. Every other document is rendered
// straight from `Fields`.

export type MndaFormValues = {
  purpose: string;
  effectiveDate: string; // ISO yyyy-mm-dd, formatted for display at render time
  // MNDA Term
  termMode: 'years' | 'until_terminated';
  termYears: number; // ignored when termMode === 'until_terminated'
  // Term of Confidentiality
  confidentialityMode: 'years' | 'perpetuity';
  confidentialityYears: number; // ignored when confidentialityMode === 'perpetuity'
  // Governing Law + Jurisdiction
  governingLaw: string; // state name
  jurisdiction: string; // "courts located in ..."
  // Modifications to the standard terms
  modifications: string;
};

// Fill unknowns so a half-finished conversation still previews. The empty
// strings are load-bearing: `validate` in lib/pdf.tsx rejects them, so a draft
// missing real answers cannot reach a PDF.
//
// Note `effectiveDate` falls back to '' and NOT to today. Defaulting it to a
// real date would sail past `validate` and silently date the agreement for a
// user who never gave one.
export function toMndaFormValues(f: Fields): MndaFormValues {
  const str = (k: string) => (f[k] == null ? '' : String(f[k]));
  const num = (k: string, fallback: number) =>
    typeof f[k] === 'number' ? (f[k] as number) : fallback;
  return {
    purpose: str('purpose'),
    effectiveDate: str('effectiveDate'),
    termMode: (f.termMode as MndaFormValues['termMode']) ?? 'years',
    termYears: num('termYears', 1),
    confidentialityMode:
      (f.confidentialityMode as MndaFormValues['confidentialityMode']) ?? 'years',
    confidentialityYears: num('confidentialityYears', 1),
    governingLaw: str('governingLaw'),
    jurisdiction: str('jurisdiction'),
    modifications: str('modifications'),
  };
}
