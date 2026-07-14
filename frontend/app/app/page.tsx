'use client';

import { useMemo, useState } from 'react';
import { NdaChat } from '../_components/NdaChat';
import { NdaPreview } from '../_components/NdaPreview';
import { buildNdaPdfBlob, validate } from '@/lib/pdf';
import { emptyFields, toFormValues, type MndaFields } from '@/lib/types';
import styles from './page.module.css';

export default function AppPage() {
  // `fields` is what the user has told the AI; the preview and the PDF need a
  // fully-populated document, so derive one rather than storing both.
  const [fields, setFields] = useState<MndaFields>(emptyFields);
  const [isRendering, setIsRendering] = useState(false);

  const values = useMemo(() => toFormValues(fields), [fields]);

  async function handleDownload() {
    const problem = validate(values);
    if (problem) {
      alert(`Could not generate PDF: ${problem}`);
      return;
    }
    setIsRendering(true);
    try {
      const blob = await buildNdaPdfBlob(values);
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
          Tell the assistant about your deal and it will fill in the agreement as you
          go. Review the draft on the right, then download a print-ready PDF. This is
          a drafting tool, not legal advice.
        </p>
      </header>
      <div className={styles.grid}>
        <NdaChat fields={fields} onFields={setFields} />
        <NdaPreview values={values} onDownload={handleDownload} isRendering={isRendering} />
      </div>
    </main>
  );
}
