'use client';

import { useEffect, useState } from 'react';
import type { MndaFormValues } from '@/lib/types';
import { renderNda } from '@/lib/render';
import styles from './NdaPreview.module.css';

type Props = {
  values: MndaFormValues;
  onDownload: () => void;
  isRendering: boolean;
};

// Live preview of the agreement. Shares `renderNda` with the PDF pipeline, so
// what is previewed is exactly what gets downloaded.
export function NdaPreview({ values, onDownload, isRendering }: Props) {
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
      <header className={styles.bar}>
        <h2 className={styles.heading}>Preview</h2>
        <button
          type="button"
          className={styles.download}
          onClick={onDownload}
          disabled={isRendering}
        >
          {isRendering ? 'Rendering PDF…' : 'Download as PDF'}
        </button>
      </header>
      <pre className={styles.body}>{markdown || 'Filling in your values…'}</pre>
    </article>
  );
}
