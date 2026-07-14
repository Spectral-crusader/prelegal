'use client';

import { useEffect, useState } from 'react';
import type { MndaFormValues } from '@/lib/types';
import { renderNdaClient } from '@/lib/render-client';
import styles from './NdaPreview.module.css';

type Props = { values: MndaFormValues };

// Lightweight client-side preview that mirrors what the server renderer will
// produce. Uses the same regex substitution so the preview is always in sync
// with what the PDF will contain.
export function NdaPreview({ values }: Props) {
  const [markdown, setMarkdown] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void renderNdaClient(values).then((md) => {
      if (!cancelled) setMarkdown(md);
    });
    return () => {
      cancelled = true;
    };
  }, [values]);

  return (
    <article className={styles.preview}>
      <h2 className={styles.heading}>Preview</h2>
      <pre className={styles.body}>{markdown || 'Filling in your values…'}</pre>
    </article>
  );
}
