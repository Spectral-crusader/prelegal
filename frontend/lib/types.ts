// Two shapes, deliberately distinct:
//
//   MndaFields      — what the user has actually told the AI. Null means "not
//                     yet known", which is what lets the AI decide what to ask
//                     next. This is what crosses the wire to /api/chat.
//   MndaFormValues  — a fully-populated document, what `renderNda` and the PDF
//                     consume. Mirrors the slots on Mutual-NDA-coverpage.md.
//
// `toFormValues` is the one bridge between them, filling unknowns with
// placeholders so the preview can render a partial draft.

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

export type MndaFields = {
  purpose: string | null;
  effectiveDate: string | null;
  termMode: 'years' | 'until_terminated' | null;
  termYears: number | null;
  confidentialityMode: 'years' | 'perpetuity' | null;
  confidentialityYears: number | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  modifications: string | null;
};

export const emptyFields: MndaFields = {
  purpose: null,
  effectiveDate: null,
  termMode: null,
  termYears: null,
  confidentialityMode: null,
  confidentialityYears: null,
  governingLaw: null,
  jurisdiction: null,
  modifications: null,
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Fill unknowns so a half-finished conversation still previews. The empty
// strings are load-bearing: `validate` in lib/pdf.ts rejects them, so a draft
// missing real answers cannot reach a PDF.
//
// Note `effectiveDate` falls back to '' and NOT to today. Defaulting it to a
// real date would sail past `validate` and silently date the agreement for a
// user who never gave one.
export function toFormValues(f: MndaFields): MndaFormValues {
  return {
    purpose: f.purpose ?? '',
    effectiveDate: f.effectiveDate ?? '',
    termMode: f.termMode ?? 'years',
    termYears: f.termYears ?? 1,
    confidentialityMode: f.confidentialityMode ?? 'years',
    confidentialityYears: f.confidentialityYears ?? 1,
    governingLaw: f.governingLaw ?? '',
    jurisdiction: f.jurisdiction ?? '',
    modifications: f.modifications ?? '',
  };
}
