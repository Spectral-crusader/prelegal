'use client';

import { useEffect, useState } from 'react';
import { IntakeChat } from '../_components/IntakeChat';
import { DocumentPreview } from '../_components/DocumentPreview';
import { buildPdfBlob, pdfFilename } from '@/lib/pdf';
import { validate } from '@/lib/validate';
import { loadDocuments } from '@/lib/documents';
import type { DocumentSpec, Fields } from '@/lib/types';
import styles from './page.module.css';

export default function AppPage() {
  const [specs, setSpecs] = useState<DocumentSpec[]>([]);
  // Null until the conversation settles on a document. `fields` is whatever the
  // user has told the AI about it so far. Both are the backend's to decide: it
  // returns the document and the full merged field map on every turn, so this
  // page mirrors that answer rather than keeping its own.
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    void loadDocuments().then(setSpecs);
  }, []);

  // Derived, not stored: if the registry is still in flight when the first turn
  // lands, the spec simply appears once it arrives.
  const spec = specs.find((d) => d.id === documentId) ?? null;

  function handleTurn(nextId: string | null, next: Fields) {
    setDocumentId(nextId);
    setFields(next);
  }

  async function handleDownload() {
    if (!spec) return;
    const problem = validate(spec, fields);
    if (problem) {
      alert(`Could not generate PDF: ${problem}`);
      return;
    }
    setIsRendering(true);
    try {
      const blob = await buildPdfBlob(spec, fields);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename(spec);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Could not generate PDF: ${message}`);
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Agreement Creator</h1>
        <p>
          Tell the assistant what you need and it will pick the right agreement, then
          fill it in as you go. Review the draft on the right, then download a
          print-ready PDF. This is a drafting tool, not legal advice.
        </p>
      </header>
      <div className={styles.grid}>
        <IntakeChat documentId={documentId} spec={spec} fields={fields} onTurn={handleTurn} />
        <DocumentPreview
          spec={spec}
          fields={fields}
          onDownload={handleDownload}
          isRendering={isRendering}
        />
      </div>
    </main>
  );
}
