/**
 * Build one labeled bundle of reference-manager formats for a public Agent
 * report. Each section remains byte-for-byte identical to its standalone
 * formatter so the bundle can be split or imported without reformatting.
 */

import { formatAgentReportBibtex } from './agentReportBibtex';
import { formatAgentReportCslJson } from './agentReportCslJson';
import { formatAgentReportRis } from './agentReportRis';

/** Format BibTeX, RIS, and CSL-JSON as one portable text export. */
export function formatAgentReportReferenceBundle(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const sections: Array<[string, string]> = [
    ['BibTeX', formatAgentReportBibtex(opts)],
    ['RIS', formatAgentReportRis(opts)],
    ['CSL-JSON', formatAgentReportCslJson(opts)],
  ];

  // Keep one blank line between formats and exactly one trailing newline so
  // the bundle is readable in a text editor and deterministic in tests. Only
  // remove line terminators: RIS uses meaningful padding before its final
  // newline, and the bundle must preserve each standalone formatter exactly.
  return sections
    .map(([label, citation]) => `${label}\n${citation.replace(/\n+$/, '')}\n`)
    .join('\n');
}
