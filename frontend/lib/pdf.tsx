// PDF generation, in the browser.
//
// Why we don't render the Markdown verbatim: @react-pdf/renderer draws layouts
// directly; we want proper headings, paragraphs, and page breaks in the PDF
// rather than a pre-formatted text dump. So `markdown.ts` tokenizes the
// rendered Markdown into a simple AST and this file draws it with @react-pdf
// primitives.

import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import React from 'react';
import { renderDocument } from './render';
import { parseMarkdown, type Block, type InlineNode } from './markdown';
import type { DocumentSpec, Fields } from './types';

// NB: there is deliberately no `lineHeight` on `page`. It used to be there and
// was doing nothing — @react-pdf 4.5.1 does not inherit it to the text — while
// silently breaking the `fixed` footer: no error, the footer just never drew,
// and past two pages it threw "unsupported number: -9.09e21" from a garbage y.
// Verified against the library alone: lineHeight on the Page gives 0 footers on
// 3 pages, without it 6 of 6. Removing it leaves the text exactly as it always
// rendered and gets the footer back. If you want looser lines, set lineHeight
// on the text styles below — not on the Page, and not on the footer.

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 64,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#111',
  },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  h2: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    marginBottom: 4,
  },
  p: { marginBottom: 6 },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    marginVertical: 14,
  },
  li: { flexDirection: 'row', marginBottom: 3 },
  // Wide enough for the corpus's longest marker ("10."). The number is drawn in
  // its own column so wrapped lines align under the text, not under the marker.
  marker: { width: 22 },
  liText: { flex: 1 },
  table: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 6,
    marginBottom: 6,
  },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  th: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 6,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#f9fafb',
  },
  td: { flexGrow: 1, flexBasis: 0, padding: 6, minHeight: 22 },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 64,
    right: 64,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
});

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, idx) => {
        if (n.kind === 'bold') return <Text key={idx} style={styles.bold}>{n.text}</Text>;
        if (n.kind === 'italic') return <Text key={idx} style={styles.italic}>{n.text}</Text>;
        if (n.kind === 'link')
          return (
            <Text key={idx}>
              {n.text} ({n.href})
            </Text>
          );
        return <Text key={idx}>{n.text}</Text>;
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'h1':
      return (
        <Text style={styles.h1}>
          <Inline nodes={block.inlines} />
        </Text>
      );
    case 'h2':
      return (
        <Text style={styles.h2}>
          <Inline nodes={block.inlines} />
        </Text>
      );
    case 'h3':
      return (
        <Text style={styles.h3}>
          <Inline nodes={block.inlines} />
        </Text>
      );
    case 'p':
      return (
        <Text style={styles.p}>
          <Inline nodes={block.inlines} />
        </Text>
      );
    case 'hr':
      return <View style={styles.hr} />;
    case 'list':
      return (
        <View>
          {block.items.map((item, idx) => (
            <View key={idx} style={[styles.li, { marginLeft: item.depth * 18 }]}>
              <Text style={styles.marker}>{item.marker}</Text>
              <Text style={styles.liText}>
                <Inline nodes={item.inlines} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <View style={styles.table}>
          {block.rows.map((cells, idx) => (
            <View key={idx} style={styles.tr}>
              {cells.map((cell, cidx) => (
                <Text key={cidx} style={idx === 0 ? styles.th : styles.td}>
                  <Inline nodes={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

// The line along the bottom of every page. It carries the draft disclaimer
// because the footer is the one part of the document that repeats on every page
// and travels with the file — the screen's banner does not survive the
// download, and this is exactly when the warning matters. Exported so a test
// can pin the wording: the glyphs are subset-encoded in the PDF itself, so the
// string cannot be read back out of the bytes.
export function footerText(spec: DocumentSpec, pageNumber: number, totalPages: number): string {
  return (
    `${spec.name} — DRAFT, subject to legal review · ` +
    `Page ${pageNumber} of ${totalPages} · ` +
    'Generated by prelegal from a Common Paper template (CC BY 4.0)'
  );
}

function AgreementDocument({ spec, markdown }: { spec: DocumentSpec; markdown: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <Document title={spec.name} author="prelegal" subject={spec.name}>
      <Page size="LETTER" style={styles.page}>
        {blocks.map((block, idx) => (
          <BlockView key={idx} block={block} />
        ))}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => footerText(spec, pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}

export async function buildPdfBlob(spec: DocumentSpec, fields: Fields): Promise<Blob> {
  const markdown = await renderDocument(spec, fields);
  return pdf(<AgreementDocument spec={spec} markdown={markdown} />).toBlob();
}

// A filename the user will recognise in their downloads folder.
export function pdfFilename(spec: DocumentSpec): string {
  return `${spec.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
}
