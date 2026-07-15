'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../_components/AppShell';
import { IntakeChat } from '../_components/IntakeChat';
import { DocumentPreview } from '../_components/DocumentPreview';
import { buildPdfBlob, pdfFilename } from '@/lib/pdf';
import { validate } from '@/lib/validate';
import { loadDocuments } from '@/lib/documents';
import { getDraft } from '@/lib/drafts';
import type { ChatMessage, DocumentSpec, Fields } from '@/lib/types';
import styles from './page.module.css';

// `useSearchParams` suspends, and a statically exported page has no server to
// suspend on — so the boundary has to be here or the build fails.
export default function AppPage() {
  return (
    <AppShell active="create">
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <Creator />
      </Suspense>
    </AppShell>
  );
}

// What the chat opens with when there is no draft to restore. Fixed rather than
// generated: it costs a round trip to ask the model to say hello, and the first
// question is always the same one. Note it asks what they need rather than
// naming a document — picking one is the first thing the conversation does.
const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Hi — I can draft a range of standard business agreements. What are you trying ' +
    'to put together, and who is it with?',
};

function Creator() {
  const draftParam = useSearchParams().get('draft');
  const [specs, setSpecs] = useState<DocumentSpec[]>([]);

  // The draft being worked on. `documentId` is null until the conversation
  // settles on a document, and `draftId` until the backend first saves it —
  // every turn returns both, and this page mirrors that answer rather than
  // keeping its own.
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [transcript, setTranscript] = useState<ChatMessage[] | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDocuments().then(setSpecs);
  }, []);

  // Restore the draft named in the URL, or start fresh. Either way `transcript`
  // going non-null is what releases the chat to render, so a restored
  // conversation never flashes the greeting first.
  //
  // Moving between drafts — or from a draft to "New document" — is a client-side
  // nav that leaves this component mounted, so everything below is reset here
  // rather than left to a remount that will not happen.
  useEffect(() => {
    setDocumentId(null);
    setDraftId(null);
    setFields({});
    setTranscript(null);
    setError(null);

    if (!draftParam) {
      setTranscript([GREETING]);
      return;
    }
    let cancelled = false;
    void getDraft(Number(draftParam))
      .then((draft) => {
        if (cancelled) return;
        setDocumentId(draft.documentId);
        setDraftId(draft.id);
        setFields(draft.fields);
        setTranscript(draft.transcript);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setTranscript([GREETING]);
      });
    return () => {
      cancelled = true;
    };
  }, [draftParam]);

  // Derived, not stored: if the registry is still in flight when the first turn
  // lands, the spec simply appears once it arrives.
  const spec = specs.find((d) => d.id === documentId) ?? null;

  function handleTurn(nextId: string | null, next: Fields, nextDraftId: number | null) {
    setDocumentId(nextId);
    setFields(next);
    // Null means the turn saved nothing (no document settled yet), which must
    // not wipe an id we already hold.
    if (nextDraftId !== null) setDraftId(nextDraftId);
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

  if (!transcript) return <p className={styles.loading}>Loading your document…</p>;

  return (
    <>
      <header className={styles.header}>
        <h1>Agreement Creator</h1>
        <p>
          Tell the assistant what you need and it will pick the right agreement, then fill
          it in as you go. Your work is saved automatically — review the draft on the right,
          then download a print-ready PDF.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </header>
      <div className={styles.grid}>
        {/* Keyed on the draft so switching between drafts remounts the chat.
            It reads `initialMessages` once, at mount, so without this the
            previous conversation would stay on screen. */}
        <IntakeChat
          key={draftParam ?? 'new'}
          documentId={documentId}
          draftId={draftId}
          spec={spec}
          fields={fields}
          initialMessages={transcript}
          onTurn={handleTurn}
        />
        <DocumentPreview
          spec={spec}
          fields={fields}
          onDownload={handleDownload}
          isRendering={isRendering}
        />
      </div>
    </>
  );
}
