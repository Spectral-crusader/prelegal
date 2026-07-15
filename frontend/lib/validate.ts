// Whether a draft is complete enough to become a PDF.
//
// Spec-driven and free of any PDF concern, so it lives apart from pdf.tsx and
// stays directly testable.

import type { DocumentSpec, Fields } from './types';

// Fail fast with a clear message rather than producing a half-filled agreement.
// Optional fields are allowed through: the standard terms define an undefined
// Variable as "not applicable", so leaving one unset is a choice, not a gap.
export function validate(spec: DocumentSpec, fields: Fields): string | null {
  for (const f of spec.fields) {
    const value = fields[f.name];
    const required = f.requiredWhen
      ? fields[f.requiredWhen.field] === f.requiredWhen.equals
      : f.required;
    if (required && (value == null || String(value).trim() === '')) {
      return `Missing required field: ${f.label}`;
    }
    if (f.type === 'integer' && value != null) {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        return `${f.label} must be a whole number between 1 and 99`;
      }
    }
  }
  return null;
}
