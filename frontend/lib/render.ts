// Renderer for the Mutual NDA. Runs in the browser: it fetches the source
// Markdown from /templates (served as static assets) and substitutes the
// user's values.
//
// The source templates use two placeholder conventions:
//   - `<span class="coverpage_link">…</span>`  — a slot the user fills.
//   - `<label>…</label>`                       — helper text shown beneath a field.
// Both live inline inside Markdown, so we replace them with strings before
// handing the document to the preview or the PDF pipeline.
//
// The coverpage also encodes its choices via GitHub-style checkboxes
// ([x] / [ ]). The renderer walks those and selects one option per group.

import type { MndaFormValues } from './types';

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
