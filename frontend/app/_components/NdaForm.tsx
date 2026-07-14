'use client';

import type { ChangeEvent } from 'react';
import type { MndaFormValues } from '@/lib/types';
import styles from './NdaForm.module.css';

type Props = {
  values: MndaFormValues;
  onChange: (next: MndaFormValues) => void;
  onDownload: () => void;
  isRendering: boolean;
};

function field<K extends keyof MndaFormValues>(key: K, v: MndaFormValues, on: (n: MndaFormValues) => void) {
  return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    on({ ...v, [key]: e.target.value as MndaFormValues[K] });
}

export function NdaForm({ values, onChange, onDownload, isRendering }: Props) {
  return (
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
      <h2 className={styles.heading}>Mutual NDA — Deal Terms</h2>

      <label className={styles.field}>
        <span>Purpose</span>
        <textarea
          rows={3}
          value={values.purpose}
          onChange={field('purpose', values, onChange)}
          placeholder="What are the parties discussing?"
        />
      </label>

      <label className={styles.field}>
        <span>Effective Date</span>
        <input
          type="date"
          value={values.effectiveDate}
          onChange={field('effectiveDate', values, onChange)}
        />
      </label>

      <fieldset className={styles.field}>
        <legend>MNDA Term</legend>
        <label className={styles.radio}>
          <input
            type="radio"
            name="termMode"
            value="years"
            checked={values.termMode === 'years'}
            onChange={() => onChange({ ...values, termMode: 'years' })}
          />
          <span>
            Expires{' '}
            <input
              type="number"
              min={1}
              max={99}
              className={styles.inlineNumber}
              value={values.termYears}
              disabled={values.termMode !== 'years'}
              onChange={field('termYears', values, onChange)}
            />{' '}
            year(s) from Effective Date
          </span>
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name="termMode"
            value="until_terminated"
            checked={values.termMode === 'until_terminated'}
            onChange={() => onChange({ ...values, termMode: 'until_terminated' })}
          />
          <span>Continues until terminated</span>
        </label>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>Term of Confidentiality</legend>
        <label className={styles.radio}>
          <input
            type="radio"
            name="confidentialityMode"
            value="years"
            checked={values.confidentialityMode === 'years'}
            onChange={() => onChange({ ...values, confidentialityMode: 'years' })}
          />
          <span>
            <input
              type="number"
              min={1}
              max={99}
              className={styles.inlineNumber}
              value={values.confidentialityYears}
              disabled={values.confidentialityMode !== 'years'}
              onChange={field('confidentialityYears', values, onChange)}
            />{' '}
            year(s) from Effective Date, plus trade-secret protection
          </span>
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name="confidentialityMode"
            value="perpetuity"
            checked={values.confidentialityMode === 'perpetuity'}
            onChange={() => onChange({ ...values, confidentialityMode: 'perpetuity' })}
          />
          <span>In perpetuity</span>
        </label>
      </fieldset>

      <label className={styles.field}>
        <span>Governing Law (state)</span>
        <input
          type="text"
          value={values.governingLaw}
          onChange={field('governingLaw', values, onChange)}
          placeholder="e.g. Delaware"
        />
      </label>

      <label className={styles.field}>
        <span>Jurisdiction (courts located in…)</span>
        <input
          type="text"
          value={values.jurisdiction}
          onChange={field('jurisdiction', values, onChange)}
          placeholder="e.g. New Castle County, Delaware"
        />
      </label>

      <label className={styles.field}>
        <span>Modifications to Standard Terms (optional)</span>
        <textarea
          rows={3}
          value={values.modifications}
          onChange={field('modifications', values, onChange)}
          placeholder="Leave blank for none."
        />
      </label>

      <button
        type="button"
        className={styles.download}
        onClick={onDownload}
        disabled={isRendering}
      >
        {isRendering ? 'Rendering PDF…' : 'Download as PDF'}
      </button>
    </form>
  );
}
