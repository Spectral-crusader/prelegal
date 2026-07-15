// Tests for the renderers and the Markdown tokenizer they feed.
//
// The renderer fetches templates over HTTP, so `fetch` is pointed at the corpus
// on disk — these run against the real templates, not fixtures, which is what
// makes the "no HTML survives" and "every label is a real Variable" checks
// worth anything.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderDocument, renderGeneric } from './render';
import { parseMarkdown } from './markdown';
import { validate } from './validate';
import type { DocumentSpec, Fields } from './types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

let registry: { documents: DocumentSpec[] };

beforeAll(async () => {
  registry = JSON.parse(await readFile(path.join(ROOT, 'documents.json'), 'utf8'));
  globalThis.fetch = (async (url: string | URL) => {
    const name = path.basename(String(url));
    const text = await readFile(path.join(ROOT, 'templates', name), 'utf8');
    return { ok: true, text: async () => text } as Response;
  }) as typeof fetch;
});

const byId = (id: string) => registry.documents.find((d) => d.id === id)!;
const generic = () => registry.documents.filter((d) => d.renderer === 'generic');

function filled(spec: DocumentSpec): Fields {
  return Object.fromEntries(
    spec.fields.map((f) => [
      f.name,
      f.type === 'date' ? '2026-08-01' : f.type === 'integer' ? 2 : f.type === 'enum' ? f.options![0] : 'Acme Inc',
    ]),
  );
}

describe('renderGeneric', () => {
  it('leaves no template HTML in the output', async () => {
    for (const spec of generic()) {
      const md = await renderGeneric(spec, filled(spec));
      expect(md, spec.id).not.toMatch(/<span|<label|_link"/);
    }
  });

  it('defines every Variable it asks about on the cover page', async () => {
    for (const spec of generic()) {
      const md = await renderGeneric(spec, filled(spec));
      const keyTerms = md.slice(0, md.indexOf('# Standard Terms'));
      for (const f of spec.fields) {
        expect(keyTerms, `${spec.id}/${f.name}`).toContain(`| ${f.label} |`);
      }
    }
  });

  it('records an unset Variable as Not applicable, per the standard terms default', async () => {
    const spec = byId('pilot-agreement');
    const md = await renderGeneric(spec, {});
    expect(md).toContain('| Pilot Period | _Not applicable._ |');
  });

  it('keeps the Variables in the prose rather than substituting them', async () => {
    // The cover page defines them; splicing values into the sentences is what
    // produces "within a single 12 months".
    const spec = byId('pilot-agreement');
    const md = await renderGeneric(spec, filled(spec));
    const terms = md.slice(md.indexOf('# Standard Terms'));
    expect(terms).toContain('During the Pilot Period');
    expect(terms).not.toContain('During the Acme Inc');
  });

  it('escapes a pipe in a value so it cannot open a phantom column', async () => {
    const spec = byId('partnership-agreement');
    const md = await renderGeneric(spec, { ...filled(spec), obligations: 'resell | train' });
    expect(md).toContain('| Obligations | resell \\| train |');
  });

  it('folds a newline in a value so it cannot end the table', async () => {
    // An unfolded newline drops every row below it out of the table and into
    // the document as raw text.
    const spec = byId('partnership-agreement');
    const md = await renderGeneric(spec, { ...filled(spec), obligations: 'one\ntwo' });
    expect(md).toContain('| Obligations | one two |');
    expect(md).toContain('| Governing Law |');
  });

  it('formats dates for reading', async () => {
    const spec = byId('pilot-agreement');
    const md = await renderGeneric(spec, { effectiveDate: '2026-08-01' });
    expect(md).toContain('| Effective Date | August 1, 2026 |');
  });
});

describe('renderDocument', () => {
  it('sends the MNDA down its bespoke path, cover page and all', async () => {
    const md = await renderDocument(byId('mutual-nda'), {
      purpose: 'Evaluating a partnership',
      effectiveDate: '2026-08-01',
      termMode: 'years',
      termYears: 2,
      confidentialityMode: 'perpetuity',
      confidentialityYears: null,
      governingLaw: 'Delaware',
      jurisdiction: 'New Castle County, Delaware',
      modifications: null,
    });
    // Its checkbox options get selected, which the generic renderer cannot do.
    expect(md).toContain('**Expires 2 years from Effective Date.**');
    expect(md).toContain('**In perpetuity.**');
    // And unlike the generic path, its values are substituted into the prose.
    expect(md).toContain('the laws of the State of Delaware');
  });

  it('renders every document in the registry', async () => {
    for (const spec of registry.documents) {
      const md = await renderDocument(spec, filled(spec));
      expect(md.length, spec.id).toBeGreaterThan(1000);
    }
  });
});

describe('parseMarkdown', () => {
  it('numbers clauses from the source, not from position', () => {
    // The corpus separates clauses with blank lines, so each parses as its own
    // single-item list. Numbering by position rendered every clause as "1.".
    const blocks = parseMarkdown('1. First\n\n2. Second\n\n11. Eleventh');
    const markers = blocks.flatMap((b) => (b.kind === 'list' ? b.items.map((i) => i.marker) : []));
    expect(markers).toEqual(['1.', '2.', '11.']);
  });

  it('nests indented sub-items', () => {
    const [block] = parseMarkdown('1. Top\n    1. Sub\n        a. Deep');
    expect(block.kind).toBe('list');
    if (block.kind !== 'list') throw new Error('expected a list');
    expect(block.items.map((i) => [i.depth, i.marker])).toEqual([
      [0, '1.'],
      [1, '1.'],
      [2, 'a.'],
    ]);
  });

  it('gives header and body rows the same column count', () => {
    // `||` is the corpus's empty leading cell, not a cell separator.
    const [block] = parseMarkdown('|| PARTY 1 | PARTY 2 |\n|:--- | :---: | :---: |\n| Signature | | |');
    if (block.kind !== 'table') throw new Error('expected a table');
    expect(block.rows[0]).toHaveLength(3);
    expect(block.rows[1]).toHaveLength(3);
  });

  it('unescapes a pipe inside a cell instead of splitting on it', () => {
    const [block] = parseMarkdown('| Term | Definition |\n|:--- | :--- |\n| Obligations | a \\| b |');
    if (block.kind !== 'table') throw new Error('expected a table');
    expect(block.rows[1]).toHaveLength(2);
    expect(block.rows[1][1]).toEqual([{ kind: 'text', text: 'a | b' }]);
  });
});

describe('validate', () => {
  it('accepts a document whose optional Variables are unset', () => {
    const spec = byId('ai-addendum');
    expect(validate(spec, { provider: 'Acme Inc', customer: 'Globex LLC' })).toBeNull();
  });

  it('names the missing Variable', () => {
    expect(validate(byId('ai-addendum'), { provider: 'Acme Inc' })).toBe(
      'Missing required field: Customer',
    );
  });

  it('requires the term length once a fixed term is chosen', () => {
    // Otherwise toMndaFormValues' fallback quietly issues a 1-year NDA.
    const spec = byId('mutual-nda');
    const base = {
      purpose: 'Evaluating a partnership',
      effectiveDate: '2026-08-01',
      confidentialityMode: 'perpetuity',
      governingLaw: 'Delaware',
      jurisdiction: 'New Castle County, Delaware',
    };
    expect(validate(spec, { ...base, termMode: 'years', termYears: null })).toBe(
      'Missing required field: MNDA Term (years)',
    );
    expect(validate(spec, { ...base, termMode: 'until_terminated', termYears: null })).toBeNull();
  });

  it('rejects an out-of-range term', () => {
    const spec = byId('mutual-nda');
    const complete = {
      purpose: 'Evaluating a partnership',
      effectiveDate: '2026-08-01',
      termMode: 'years',
      termYears: 0,
      confidentialityMode: 'perpetuity',
      governingLaw: 'Delaware',
      jurisdiction: 'New Castle County, Delaware',
    };
    expect(validate(spec, complete)).toContain('between 1 and 99');
  });
});
