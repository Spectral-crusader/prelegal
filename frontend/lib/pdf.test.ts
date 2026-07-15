// Tests for the PDF itself.
//
// Slower than the rest of the suite because they lay out real documents, but
// laying them out is the only thing that catches a whole class of failure here:
// @react-pdf problems show up as a throw from deep inside the layout engine, or
// as an element silently missing from the page, and neither leaves a trace in
// the Markdown the other tests check.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPdfBlob, footerText, pdfFilename } from './pdf';
import type { DocumentSpec, Fields } from './types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

let registry: { documents: DocumentSpec[] };

beforeAll(async () => {
  registry = JSON.parse(await readFile(path.join(ROOT, 'documents.json'), 'utf8'));
  globalThis.fetch = (async (url: string | URL) => {
    const text = await readFile(path.join(ROOT, 'templates', path.basename(String(url))), 'utf8');
    return { ok: true, text: async () => text } as Response;
  }) as typeof fetch;
});

const byId = (id: string) => registry.documents.find((d) => d.id === id)!;

function filled(spec: DocumentSpec): Fields {
  return Object.fromEntries(
    spec.fields.map((f) => [
      f.name,
      f.type === 'date'
        ? '2026-08-01'
        : f.type === 'integer'
          ? 2
          : f.type === 'enum'
            ? f.options![0]
            : 'Acme Inc',
    ]),
  );
}

async function build(spec: DocumentSpec): Promise<Buffer> {
  const blob = await buildPdfBlob(spec, filled(spec));
  return Buffer.from(await blob.arrayBuffer());
}

describe('buildPdfBlob', () => {
  // This is also the guard on the page footer, indirectly and on purpose. A
  // `lineHeight` on the Page style stops @react-pdf 4.5.1 drawing the fixed
  // footer at all, and past two pages makes it throw "unsupported number:
  // -9.09e21" — so the Cloud Service Agreement, the longest document in the
  // corpus, fails here the moment lineHeight comes back. Asserting the footer's
  // text instead would need a font-aware PDF parser (the glyphs are subset-
  // encoded, so the string is not in the file), which is not worth a dependency
  // when the same bug already fails loudly. Measured: with lineHeight on the
  // Page, the CSA throws and the AI Addendum silently loses all 3 footers;
  // without it, 10/10 and 3/3.
  it('renders every document in the registry', async () => {
    for (const spec of registry.documents) {
      const pdf = await build(spec);
      expect(pdf.subarray(0, 4).toString(), spec.id).toBe('%PDF');
    }
  }, 60_000);

  it('names the file after the document', () => {
    expect(pdfFilename(byId('cloud-service-agreement'))).toBe('Cloud-Service-Agreement.pdf');
  });
});

describe('footerText', () => {
  // The disclaimer has to survive the download — the screen's banner does not.
  it('marks every page as a draft subject to legal review', () => {
    expect(footerText(byId('mutual-nda'), 2, 6)).toContain('DRAFT, subject to legal review');
  });

  it('numbers the page and credits the source', () => {
    const footer = footerText(byId('mutual-nda'), 2, 6);
    expect(footer).toContain('Page 2 of 6');
    expect(footer).toContain('CC BY 4.0');
  });
});
