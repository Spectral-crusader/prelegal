// A Markdown tokenizer scoped to the structure the renderers produce: headings,
// paragraphs, lists, tables, rules. Not a general-purpose parser — that would
// add a dependency for no gain on this fixed-template corpus.
//
// Separate from pdf.tsx because parsing is not drawing: this file is pure and
// has no React in it, which keeps it directly testable.

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'link'; text: string; href: string };

// One line of a list. `marker` is the literal text from the source ("3.", "b.",
// "•") and `depth` its nesting level, so a clause keeps the number the template
// gave it. Deriving numbers from position instead is what made every clause
// render as "1.": the corpus separates clauses with blank lines, so each one
// parsed as a fresh single-item list starting over at 1.
export type ListItem = { depth: number; marker: string; inlines: InlineNode[] };

export type Block =
  | { kind: 'h1' | 'h2' | 'h3'; inlines: InlineNode[] }
  | { kind: 'p'; inlines: InlineNode[] }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'table'; rows: InlineNode[][][] }
  | { kind: 'hr' };

// A list line: optional indent, then "1." / "a." / "-" / "*", then the text.
const LIST_RE = /^(\s*)(\d+\.|[a-zA-Z]\.|[-*])\s+(.*)$/;

// A table starts at a `|` line whose successor is a `|:---|` separator.
const TABLE_SEP_RE = /^\|[\s:|-]*$/;

// Cells of one row. A leading `||` is the corpus's way of writing an empty
// first cell, so splitting on single pipes after trimming the outer ones gives
// header and body rows the same column count. `\|` is an escaped pipe inside a
// value (see `cell` in render.ts), not a cell boundary.
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

// Minimal Markdown tokenizer scoped to the structure produced by `renderNda`.
// Not a general-purpose parser — that would add a dependency for no gain on
// this fixed-template corpus.
export function parseInline(input: string): InlineNode[] {
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

export function parseMarkdown(md: string): Block[] {
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
    const listLine = line.match(LIST_RE);
    if (listLine) {
      const items: ListItem[] = [];
      // Indentation is 4 spaces per level throughout the corpus; anything else
      // still nests monotonically, which is all the renderer needs.
      while (i < lines.length) {
        const item = lines[i].match(LIST_RE);
        if (!item) break;
        const [, indent, marker, text] = item;
        items.push({
          depth: Math.floor(indent.length / 4),
          marker: /[-*]/.test(marker) ? '•' : marker,
          inlines: parseInline(text),
        });
        i += 1;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }
    if (line.startsWith('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const rows: InlineNode[][][] = [splitRow(line).map(parseInline)];
      i += 2;
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(splitRow(lines[i]).map(parseInline));
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
      !LIST_RE.test(lines[i]) &&
      !lines[i].startsWith('|') &&
      !lines[i].trim().startsWith('---')
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'p', inlines: parseInline(para.join(' ')) });
  }
  return blocks;
}
