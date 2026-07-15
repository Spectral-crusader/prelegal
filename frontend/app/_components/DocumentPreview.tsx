'use client';

import { useEffect, useState } from 'react';
import type { DocumentSpec, Fields } from '@/lib/types';
import { renderDocument } from '@/lib/render';
import styles from './DocumentPreview.module.css';

type Props = {
  spec: DocumentSpec | null;
  fields: Fields;
  onDownload: () => void;
  isRendering: boolean;
};

// Live preview of the agreement. Shares `renderDocument` with the PDF pipeline,
// so what is previewed is exactly what gets downloaded. Empty until the
// conversation has settled on a document — there is nothing to draw before then.
export function DocumentPreview({ spec, fields, onDownload, isRendering }: Props) {
  const [markdown, setMarkdown] = useState<string>('');

  useEffect(() => {
    if (!spec) {
      setMarkdown('');
      return;
    }
    let cancelled = false;
    void renderDocument(spec, fields).then((md) => {
      if (!cancelled) setMarkdown(md);
    });
    return () => {
      cancelled = true;
    };
  }, [spec, fields]);

  return (
    <article className={styles.preview}>
      <header className={styles.bar}>
        <h2 className={styles.heading}>{spec ? spec.name : 'Preview'}</h2>
        <button
          type="button"
          className={styles.download}
          onClick={onDownload}
          disabled={isRendering || !spec}
        >
          {isRendering ? 'Rendering PDF…' : 'Download as PDF'}
        </button>
      </header>
      <pre className={styles.body}>
        {spec
          ? markdown || 'Filling in your values…'
          : 'Your draft will appear here once we have settled on a document.'}
      </pre>
    </article>
  );
}
