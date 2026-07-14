'use client';

import { useState } from 'react';
import { NdaForm } from './_components/NdaForm';
import { NdaPreview } from './_components/NdaPreview';
import { defaultValues, type MndaFormValues } from '@/lib/types';
import styles from './page.module.css';

export default function HomePage() {
  const [values, setValues] = useState<MndaFormValues>(defaultValues);
  const [isRendering, setIsRendering] = useState(false);

  async function handleDownload() {
    setIsRendering(true);
    try {
      const res = await fetch('/api/render-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Render failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Mutual-NDA.pdf';
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
        <h1>Mutual NDA Creator</h1>
        <p>
          A prototype of the prelegal intake flow. Fill in the deal terms, review the
          rendered agreement, and download a print-ready PDF.
        </p>
      </header>
      <div className={styles.grid}>
        <NdaForm
          values={values}
          onChange={setValues}
          onDownload={handleDownload}
          isRendering={isRendering}
        />
        <NdaPreview values={values} />
      </div>
    </main>
  );
}