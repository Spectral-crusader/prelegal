// Server-only PDF generation for the Mutual NDA.
//
// Why we don't reuse the live-preview Markdown verbatim: @react-pdf/renderer
// draws layouts directly; we want proper headings, paragraphs, and page
// breaks in the PDF rather than a pre-formatted text dump. So we re-tokenize
// the rendered Markdown into a simple AST (headings, paragraphs, lists,
// tables, hr) and pass it to a small renderer that uses @react-pdf primitives.

import { NextResponse } from 'next/server';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import React from 'react';
import { renderNda } from '@/lib/render';
import type { MndaFormValues } from '@/lib/types';

export const runtime = 'nodejs';

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 64,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.4,
    color: '#111',
  },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 6 },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    marginVertical: 14,
  },
  li: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 14 },
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

type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string };

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; inlines: InlineNode[] }
  | { kind: 'p'; inlines: InlineNode[] }
  | { kind: 'ul'; items: InlineNode[][] }
  | { kind: 'ol'; items: InlineNode[][] }
  | { kind: 'table'; rows: InlineNode[][][] }
  | { kind: 'hr' };

// Minimal Markdown tokenizer scoped to the structure produced by `renderNda`.
// Not a general-purpose parser — that would add a dependency for no gain on
// this fixed-template corpus.
function parseInline(input: string): InlineNode[] {
  const out: InlineNode[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };
  while (i < input.length) {
    const rest = input.slice(i);
    const boldMatch = rest.match(/^\*\*([^*]+)\*\*/);
    const italicMatch = rest.match(/^_([^_]+)_/);
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (boldMatch) {
      flush();
      out.push({ kind: 'bold', text: boldMatch[1] });
      i += boldMatch[0].length;
    } else if (italicMatch) {
      flush();
      out.push({ kind: 'italic', text: italicMatch[1] });
      i += italicMatch[0].length;
    } else if (linkMatch) {
      flush();
      out.push({ kind: 'link', text: linkMatch[1], href: linkMatch[2] });
      i += linkMatch[0].length;
    } else {
      buf += input[i];
      i += 1;
    }
  }
  flush();
  return out;
}

function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      blocks.push({ kind: 'hr' });
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ kind: `h${level}` as 'h1' | 'h2' | 'h3', inlines: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: InlineNode[][] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(parseInline(lines[i].slice(2)));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\d+\.\s+/, '')));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    if (line.startsWith('||') && i + 1 < lines.length && lines[i + 1].startsWith('|:')) {
      const rows: InlineNode[][][] = [];
      // First row uses `||` for cell separators; subsequent rows use `|`.
      rows.push(
        line
          .trim()
          .replace(/^\|\||\|\s*$/g, '')
          .split('||')
          .map((c) => c.trim())
          .map(parseInline),
      );
      i += 2;
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|\s*$/g, '')
          .split('|')
          .map((c) => c.trim())
          .map(parseInline);
        rows.push(cells);
        i += 1;
      }
      blocks.push({ kind: 'table', rows });
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    // paragraph: collect contiguous non-empty, non-special lines
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].startsWith('- ') &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith('||') &&
      !lines[i].trim().startsWith('---')
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'p', inlines: parseInline(para.join(' ')) });
  }
  return blocks;
}

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
    case 'ul':
      return (
        <View>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.li}>
              <Text style={styles.bullet}>•</Text>
              <Text style={{ flex: 1 }}>
                <Inline nodes={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'ol':
      return (
        <View>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.li}>
              <Text style={styles.bullet}>{idx + 1}.</Text>
              <Text style={{ flex: 1 }}>
                <Inline nodes={item} />
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

function NdaDocument({ markdown }: { markdown: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <Document
      title="Mutual Non-Disclosure Agreement"
      author="prelegal"
      subject="Mutual NDA"
    >
      <Page size="LETTER" style={styles.page}>
        {blocks.map((block, idx) => (
          <BlockView key={idx} block={block} />
        ))}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Mutual NDA — prelegal prototype · Page ${pageNumber} of ${totalPages} · Based on Common Paper MNDA v1.0 (CC BY 4.0)`
          }
        />
      </Page>
    </Document>
  );
}

// Suppress an unused-import warning from Font for the rare case a future
// custom font is wired in. Cheap to keep available.
export async function POST(req: Request) {
  let body: MndaFormValues;
  try {
    body = (await req.json()) as MndaFormValues;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Light input validation — fail fast with a clear message rather than
  // rendering a half-filled NDA.
  const required: (keyof MndaFormValues)[] = [
    'purpose',
    'effectiveDate',
    'governingLaw',
    'jurisdiction',
  ];
  for (const k of required) {
    if (!body[k] || String(body[k]).trim() === '') {
      return NextResponse.json({ error: `Missing required field: ${k}` }, { status: 422 });
    }
  }
  if (body.termMode !== 'years' && body.termMode !== 'until_terminated') {
    return NextResponse.json({ error: 'termMode must be "years" or "until_terminated"' }, { status: 422 });
  }
  if (body.confidentialityMode !== 'years' && body.confidentialityMode !== 'perpetuity') {
    return NextResponse.json(
      { error: 'confidentialityMode must be "years" or "perpetuity"' },
      { status: 422 },
    );
  }
  if (body.termMode === 'years' && (!Number.isInteger(body.termYears) || body.termYears < 1 || body.termYears > 99)) {
    return NextResponse.json({ error: 'termYears must be an integer 1–99' }, { status: 422 });
  }
  if (
    body.confidentialityMode === 'years' &&
    (!Number.isInteger(body.confidentialityYears) ||
      body.confidentialityYears < 1 ||
      body.confidentialityYears > 99)
  ) {
    return NextResponse.json({ error: 'confidentialityYears must be an integer 1–99' }, { status: 422 });
  }

  const rendered = await renderNda(body);
  const instance = pdf(<NdaDocument markdown={rendered.markdown} />);
  const stream = await instance.toBuffer();

  // Drain the Node readable stream into a single Uint8Array so we can hand it
  // to NextResponse. For prototype-sized documents (a few KB) this is fine;
  // a production render path should pipe the stream through instead.
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks));

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Mutual-NDA.pdf"',
    },
  });
}