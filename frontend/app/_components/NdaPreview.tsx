'use client';

import { useEffect, useState } from 'react';
import type { MndaFormValues } from '@/lib/types';
import { renderNda } from '@/lib/render';
import styles from './NdaPreview.module.css';

type Props = { values: MndaFormValues };

// Live preview of the agreement. Shares `renderNda` with the PDF pipeline, so
// what is previewed is exactly what gets downloaded.
export function NdaPreview({ values }: Props) {
  const [markdown, setMarkdown] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void renderNda(values).then((md) => {
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
