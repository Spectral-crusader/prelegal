'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../_components/AppShell';
import { listDrafts, formatUpdated, type DraftSummary } from '@/lib/drafts';
import styles from './page.module.css';

// Everything the signed-in user has drafted, most recent first. Each row opens
// the creator on that draft, conversation and all.
export default function DocumentsPage() {
  return (
    <AppShell active="documents">
      <DocumentList />
    </AppShell>
  );
}

function DocumentList() {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listDrafts()
      .then(setDrafts)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <section>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>My documents</h1>
          <p className={styles.subtitle}>
            Every agreement you have started. Open one to carry on where you stopped, or to
            download it again.
          </p>
        </div>
        <Link href="/app" className={styles.newButton}>
          New document
        </Link>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {/* Three states, deliberately distinct: still loading, genuinely empty,
          and a list. Showing the empty state while the fetch is in flight would
          tell a returning user their work is gone. */}
      {!drafts && !error && <p className={styles.muted}>Loading your documents…</p>}

      {drafts?.length === 0 && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Nothing here yet</h2>
          <p className={styles.muted}>
            Start a conversation and your draft will be saved here automatically.
          </p>
          <Link href="/app" className={styles.newButton}>
            Draft your first document
          </Link>
        </div>
      )}

      {drafts && drafts.length > 0 && (
        <ul className={styles.list}>
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Link href={`/app?draft=${draft.id}`} className={styles.row}>
                <span className={styles.name}>{draft.documentName}</span>
                <span className={styles.meta}>Edited {formatUpdated(draft.updatedAt)}</span>
                <span className={styles.open} aria-hidden="true">
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
