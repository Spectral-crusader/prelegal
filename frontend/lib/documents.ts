// The document registry, fetched from the backend once per page load.
//
// documents.json is the single source of truth and lives server-side, so the
// browser asks for it rather than keeping a second copy in sync.

import type { DocumentSpec } from './types';

let pending: Promise<DocumentSpec[]> | null = null;

export function loadDocuments(): Promise<DocumentSpec[]> {
  if (!pending) {
    pending = fetch('/api/documents')
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load documents (HTTP ${res.status}).`);
        return res.json();
      })
      // Drop the rejected promise so a retry can succeed.
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
