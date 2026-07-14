// Client-side renderer for the live preview. Mirrors the server renderer's
// substitutions but reads the source templates as inlined strings so it can
// run in the browser without bundling the Markdown asset files.
//
// If the server and client renderers ever drift, the PDF and the preview will
// disagree — keep them in sync by editing both `lib/render.ts` and this file.

import type { MndaFormValues } from './types';

// Inlined excerpts of the two source templates. The fields that aren't
// replaced by the renderer are kept verbatim so the preview matches the
// rendered PDF byte-for-byte where it matters.

const COVERPAGE_SOURCE = `# Mutual Non-Disclosure Agreement

## USING THIS MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“**Cover Page**”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“**Standard Terms**”) identical to those posted at [commonpaper.com/standards/mutual-nda/1.0](https://commonpaper.com/standards/mutual-nda/1.0). Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.

### Purpose

[Evaluating whether to enter into a business relationship with the other party.]

### Effective Date
[Today’s date]

### MNDA Term

- [x]     Expires [1 year(s)] from Effective Date.
- [ ]     Continues until terminated in accordance with the terms of the MNDA.

### Term of Confidentiality

- [x]     [1 year(s)] from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.
- [ ]     In perpetuity.

### Governing Law & Jurisdiction
Governing Law: [Fill in state]

Jurisdiction: [Fill in city or county and state, i.e. “courts located in New Castle, DE”]

### MNDA Modifications
List any modifications to the MNDA

By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.

|| PARTY 1 | PARTY 2 |
|:--- | :----: | :----: |
| Signature | | |
| Print Name | |
| Title | | |
| Company | | |
| Notice Address | | |
| Date | | |
`;

const STANDARD_TERMS_SOURCE = `# Standard Terms

1. **Introduction**. This Mutual Non-Disclosure Agreement (which incorporates these Standard Terms and the Cover Page (defined below)) (“**MNDA**”) allows each party (“**Disclosing Party**”) to disclose or make available information in connection with the <span class="coverpage_link">Purpose</span> which (1) the Disclosing Party identifies to the receiving party (“**Receiving Party**”) as “confidential”, “proprietary”, or the like or (2) should be reasonably understood as confidential or proprietary due to its nature and the circumstances of its disclosure (“**Confidential Information**”). Each party’s Confidential Information also includes the existence and status of the parties’ discussions and information on the Cover Page. Confidential Information includes technical or business information, product designs or roadmaps, requirements, pricing, security and compliance documentation, technology, inventions and know-how. To use this MNDA, the parties must complete and sign a cover page incorporating these Standard Terms (“**Cover Page**”). Each party is identified on the Cover Page and capitalized terms have the meanings given herein or on the Cover Page.

5. **Term and Termination**. This MNDA commences on the <span class="coverpage_link">Effective Date</span> and expires at the end of the <span class="coverpage_link">MNDA Term</span>. Either party may terminate this MNDA for any or no reason upon written notice to the other party. The Receiving Party’s obligations relating to Confidential Information will survive for the <span class="coverpage_link">Term of Confidentiality</span>, despite any expiration or termination of this MNDA.

9. **Governing Law and Jurisdiction**. This MNDA and all matters relating hereto are governed by, and construed in accordance with, the laws of the State of <span class="coverpage_link">Governing Law</span>, without regard to the conflict of laws provisions of such <span class="coverpage_link">Governing Law</span>. Any legal suit, action, or proceeding relating to this MNDA must be instituted in the federal or state courts located in <span class="coverpage_link">Jurisdiction</span>. Each party irrevocably submits to the exclusive jurisdiction of such <span class="coverpage_link">Jurisdiction</span> in any such suit, action, or proceeding.
`;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

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

export async function renderNdaClient(values: MndaFormValues): Promise<string> {
  let coverpage = COVERPAGE_SOURCE;
  let standardTerms = STANDARD_TERMS_SOURCE;

  coverpage = coverpage
    .replace(
      /\[Evaluating whether to enter into a business relationship with the other party\.\]/g,
      values.purpose,
    )
    .replace(/\n\[Today’s date\]/, `\n${formatDate(values.effectiveDate)}`)
    .replace(
      /\[1 year\(s\)\] from Effective Date/g,
      '1 year from Effective Date',
    );

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

  coverpage = coverpage
    .replace(/\[Fill in state\]/, values.governingLaw || '___')
    .replace(/\[Fill in city or county and state[^\]]*\]/, values.jurisdiction || '___')
    .replace(/List any modifications to the MNDA\n?/, values.modifications
      ? `\n${values.modifications}\n`
      : '\n_None._\n');

  standardTerms = standardTerms
    .replace(/<span class="coverpage_link">Purpose<\/span>/g, values.purpose || '___')
    .replace(/<span class="coverpage_link">Effective Date<\/span>/g, formatDate(values.effectiveDate))
    .replace(/<span class="coverpage_link">MNDA Term<\/span>/g, termPhrase(values))
    .replace(/<span class="coverpage_link">Term of Confidentiality<\/span>/g, confidentialityPhrase(values))
    .replace(/<span class="coverpage_link">Governing Law<\/span>/g, values.governingLaw || '___')
    .replace(/<span class="coverpage_link">Jurisdiction<\/span>/g, values.jurisdiction || '___');

  const attribution =
    '\n\n---\n\n' +
    '_Based on the Common Paper Mutual Non-Disclosure Agreement (Version 1.0), ' +
    'used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). ' +
    'Source: https://github.com/CommonPaper/Mutual-NDA_\n';

  return coverpage + attribution + '\n\n---\n\n' + standardTerms + attribution;
}