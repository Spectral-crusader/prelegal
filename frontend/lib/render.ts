// Renderers. Run in the browser: they fetch the source Markdown from
// /templates (served as static assets) and fill in the user's values.
//
// Two paths, because the corpus has two shapes:
//
//   renderNda     — the Mutual NDA, the only document shipping a real cover
//                   page. Its values are substituted inline and its checkbox
//                   options selected. Bespoke, and staying that way.
//   renderGeneric — everything else. See the comment above it; in short, these
//                   templates deliberately leave their Variables in the prose
//                   and expect a cover page to define them, so we synthesize
//                   one instead of splicing values into the sentences.
//
// `renderDocument` dispatches on the spec. Both paths feed the preview and the
// PDF, so the two can never drift.
//
// The source templates use these conventions:
//   - `<span class="coverpage_link">…</span>`  — a Variable (also keyterms_link,
//     orderform_link, businessterms_link, sow_link).
//   - `<span class="header_2">…</span>`        — a section title.
//   - `<label>…</label>`                       — helper text shown beneath a field.
// All live inline inside Markdown, so we rewrite them to plain Markdown before
// handing the document to the preview or the PDF pipeline.

import type { DocumentSpec, Fields, MndaFormValues } from './types';
import { toMndaFormValues } from './types';

// The templates never change at runtime, and `renderNda` runs on every
// keystroke of the preview — so fetch each one once and reuse the promise.
const templateCache = new Map<string, Promise<string>>();

function readTemplate(filename: string): Promise<string> {
  let pending = templateCache.get(filename);
  if (!pending) {
    pending = fetch(`/templates/${filename}`).then((res) => {
      if (!res.ok) {
        // Drop the rejected promise so a later render can retry.
        templateCache.delete(filename);
        throw new Error(`Could not load template ${filename} (HTTP ${res.status})`);
      }
      return res.text();
    });
    templateCache.set(filename, pending);
  }
  return pending;
}

// Format an ISO date as e.g. "July 14, 2026". Falls back to the raw string
// if the input is unparseable so the form never crashes the renderer.
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Build the two human-readable phrases that appear on the coverpage
// based on the user's selection, then drop them into the Standard Terms too.
function termPhrase(v: MndaFormValues): string {
  return v.termMode === 'until_terminated'
    ? 'until terminated in accordance with the terms of the MNDA'
    : `${v.termYears} year${v.termYears === 1 ? '' : 's'} from the Effective Date`;
}

function confidentialityPhrase(v: MndaFormValues): string {
  return v.confidentialityMode === 'perpetuity'
    ? 'in perpetuity'
    : `${v.confidentialityYears} year${v.confidentialityYears === 1 ? '' : 's'} from the Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws`;
}

// Pick one checkbox option per group on the coverpage. The coverpage source
// uses GFM task lists with `[x]` and `[ ]` for MNDA Term and Term of
// Confidentiality. We bold the user-selected option and italicize the rest.
//
// `selectors` is a list of {matcher, replacement} pairs. The first matcher
// that fires for a given line wins; if none matches, the line is left as
// italicized prose. Doing all selections in a single pass keeps the line
// recognizable as a task list (the prior version's regex rewrote the line
// in place, so subsequent calls stopped matching it).
function selectCheckbox(
  md: string,
  selectors: Array<{ matcher: RegExp; replacement: string }>,
): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const taskLine = line.match(/^(\s*)- \[(x| )\]\s*(.*)$/i);
    if (taskLine) {
      const [, indent, , rest] = taskLine;
      const text = rest.trim();
      const hit = selectors.find((s) => s.matcher.test(text));
      if (hit) {
        out.push(`${indent}- **${hit.replacement}**`);
      } else {
        out.push(`${indent}- _${text}_`);
      }
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

// ---- the generic renderer -------------------------------------------------
//
// Every template except the Mutual NDA is a set of Standard Terms that leaves
// its Variables — Provider, Subscription Period, Governing Law — capitalized in
// the prose, to be defined by a signed cover page. The templates say so
// themselves; the Pilot Agreement's §8.1 is typical:
//
//   "Variables have the meanings or descriptions given on the Order Form.
//    However, if the Order Form omits or does not define a Variable, the
//    default meaning will be 'none' or 'not applicable' and the correlating
//    clause, sentence, or section does not apply to that Agreement."
//
// So we do not splice values into the sentences. We unwrap the Variable spans
// to plain text and synthesize the cover page the standard terms are asking
// for. That keeps the prose grammatical (no "within a single 12 months"), gives
// unfilled optional fields a defined legal meaning rather than a blank, and
// leaves the corpus readable as what it is.

// Unwrap the template's inline HTML into plain Markdown. Variables keep their
// name — the Key Terms table defines them — and section titles become bold.
function toMarkdown(md: string): string {
  return (
    md
      // These files are the standard terms, and say so themselves ("Standard
      // Terms means these Common Paper … Standard Terms Version 2.0"). Their
      // own h1 is the agreement's name, which the cover page above already
      // carries, so retitle rather than print it twice. Mirrors how the MNDA's
      // two files are titled.
      .replace(/^# .*$/m, '# Standard Terms')
      .replace(/<label>[^<]*<\/label>\n?/g, '')
      // Section titles. Bold rather than a heading: they are already numbered
      // list items, and a heading would break the list.
      .replace(/<span class="header_[23]"[^>]*>([^<]*)<\/span>/g, '**$1**')
      // Variables, in all five of the corpus's naming conventions.
      .replace(
        /<span class="(?:keyterms|coverpage|orderform|businessterms|sow)_link"[^>]*>([^<]*)<\/span>/g,
        '$1',
      )
      // Anchors the corpus leaves lying around, e.g. `<span id="3.1"></span>`.
      .replace(/<span[^>]*>([^<]*)<\/span>/g, '$1')
  );
}

// A Variable's definition is free prose from the AI, and it lands in a Markdown
// table cell. A newline would end the table — dropping every row below it into
// the document as raw text — and a pipe would open a column that isn't there.
// Fold the first and escape the second; `splitRow` in pdf.tsx honours the escape.
function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

// The cover page the standard terms expect: what each Variable means, and
// somewhere to sign. Unset Variables are recorded as "Not applicable", which is
// exactly the default the templates give them.
function coverPage(spec: DocumentSpec, fields: Fields): string {
  const rows = spec.fields.map((f) => {
    const raw = fields[f.name];
    const value =
      raw == null || String(raw).trim() === ''
        ? '_Not applicable._'
        : f.type === 'date'
          ? formatDate(String(raw))
          : cell(String(raw));
    return `| ${f.label} | ${value} |`;
  });

  return [
    `# ${spec.name}`,
    '',
    '## Key Terms',
    '',
    `This Cover Page defines the Variables used in the ${spec.name} Standard Terms below, and is incorporated into them. A Variable left as "Not applicable" has no meaning and the clauses relying on it do not apply.`,
    '',
    '| Term | Definition |',
    '|:--- | :--- |',
    ...rows,
    '',
    'By signing this Cover Page, each party agrees to enter into this agreement.',
    '',
    '|| PARTY 1 | PARTY 2 |',
    '|:--- | :----: | :----: |',
    '| Signature | | |',
    '| Print Name | | |',
    '| Title | | |',
    '| Company | | |',
    '| Date | | |',
  ].join('\n');
}

function genericAttribution(spec: DocumentSpec): string {
  return (
    '\n\n---\n\n' +
    `_Based on the Common Paper ${spec.name}, used under ` +
    '[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). ' +
    'Source: https://github.com/CommonPaper_\n'
  );
}

// A synthesized cover page, then the standard terms. Feeds both the live
// preview and the PDF.
export async function renderGeneric(spec: DocumentSpec, fields: Fields): Promise<string> {
  const sources = await Promise.all(spec.templates.map(readTemplate));
  const body = sources.map(toMarkdown).join('\n\n---\n\n');
  return (
    coverPage(spec, fields) + genericAttribution(spec) + '\n\n---\n\n' + body + genericAttribution(spec)
  );
}

// Render whichever document the conversation settled on.
export function renderDocument(spec: DocumentSpec, fields: Fields): Promise<string> {
  return spec.renderer === 'mnda'
    ? renderNda(toMndaFormValues(fields))
    : renderGeneric(spec, fields);
}

// The full document — coverpage, divider, standard terms — with the user's
// values substituted and the CC BY 4.0 attribution appended. Feeds both the
// live preview and the PDF, so the two can never drift.
export async function renderNda(values: MndaFormValues): Promise<string> {
  let coverpage = await readTemplate('Mutual-NDA-coverpage.md');
  let standardTerms = await readTemplate('Mutual-NDA.md');

  // ---- Cover page substitutions -------------------------------------------
  coverpage = coverpage.replace(/<label>[^<]*<\/label>\n?/g, ''); // remove helper labels

  // For each pair, only the user-selected option is bolded. The unselected
  // sibling is left as italicized prose. We only pass the chosen option's
  // matcher; the unselected one will fall through to the italic branch.
  const termSelector = values.termMode === 'until_terminated'
    ? { matcher: /Continues until terminated/, replacement: 'Continues until terminated in accordance with the terms of the MNDA.' }
    : { matcher: /Expires.*Effective Date/, replacement: `Expires ${values.termYears} year${values.termYears === 1 ? '' : 's'} from Effective Date.` };

  const confidentialitySelector = values.confidentialityMode === 'perpetuity'
    ? { matcher: /In perpetuity\./, replacement: 'In perpetuity.' }
    : {
        matcher: /from Effective Date.*trade secret/,
        replacement: `${values.confidentialityYears} year${values.confidentialityYears === 1 ? '' : 's'} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`,
      };

  coverpage = selectCheckbox(coverpage, [termSelector, confidentialitySelector]);

  // Replace placeholder text the template uses outside <span>/<label> tags.
  coverpage = coverpage
    // Coverpage defaults the Purpose paragraph to a sample sentence; replace
    // it with whatever the user typed (even if it matches the default).
    .replace(
      /\[Evaluating whether to enter into a business relationship with the other party\.\]/g,
      values.purpose,
    )
    // The Effective Date placeholder appears on its own line.
    .replace(/\n\[Today’s date\]/, `\n${formatDate(values.effectiveDate)}`)
    // The two MNDA Term branches both use `[1 year(s)]` as a default; the
    // selected one already got its full line replaced above, but the unselected
    // branch still references the default — leave it unbracketed and general.
    .replace(/\[1 year\(s\)\] from Effective Date/g, '1 year from Effective Date')
    .replace(/\[Fill in state\]/, values.governingLaw || '___')
    .replace(/\[Fill in city or county and state[^\]]*\]/, values.jurisdiction || '___')
    .replace(/List any modifications to the MNDA\n?/, values.modifications
      ? `\n${values.modifications}\n`
      : '\n_None._\n');

  // ---- Standard terms substitutions --------------------------------------
  standardTerms = standardTerms
    .replace(/<label>[^<]*<\/label>/g, '')
    .replace(/<span class="coverpage_link">Purpose<\/span>/g, values.purpose || '___')
    .replace(
      /<span class="coverpage_link">Effective Date<\/span>/g,
      formatDate(values.effectiveDate),
    )
    .replace(/<span class="coverpage_link">MNDA Term<\/span>/g, termPhrase(values))
    .replace(
      /<span class="coverpage_link">Term of Confidentiality<\/span>/g,
      confidentialityPhrase(values),
    )
    .replace(/<span class="coverpage_link">Governing Law<\/span>/g, values.governingLaw || '___')
    .replace(/<span class="coverpage_link">Jurisdiction<\/span>/g, values.jurisdiction || '___');

  // ---- Compose -----------------------------------------------------------
  const attribution =
    '\n\n---\n\n' +
    '_Based on the Common Paper Mutual Non-Disclosure Agreement (Version 1.0), ' +
    'used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). ' +
    'Source: https://github.com/CommonPaper/Mutual-NDA_\n';

  return coverpage + attribution + '\n\n---\n\n' + standardTerms + attribution;
}
