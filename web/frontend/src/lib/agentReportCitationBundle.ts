/**
 * Build a labeled bundle of the four prose citation styles (APA, Chicago,
 * IEEE, MLA) for a public Agent report.
 *
 * Writers often need the same source in several styles; copying each one
 * separately is tedious and error-prone. Each formatter already sanitizes
 * metadata and URLs identically, so the bundle simply labels their output.
 * Reference-manager formats (BibTeX, CSL-JSON, RIS) stay separate exports —
 * they are consumed by software, not pasted into documents.
 */

import { formatAgentReportApa } from './agentReportApa';
import { formatAgentReportChicago } from './agentReportChicago';
import { formatAgentReportIeee } from './agentReportIeee';
import { formatAgentReportMla } from './agentReportMla';

/** Format a public Agent report as a labeled multi-style citation bundle. */
export function formatAgentReportCitationBundle(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const sections: Array<[string, string]> = [
    ['APA', formatAgentReportApa(opts)],
    ['Chicago', formatAgentReportChicago(opts)],
    ['IEEE', formatAgentReportIeee(opts)],
    ['MLA', formatAgentReportMla(opts)],
  ];

  // Every formatter terminates its citation with exactly one newline, so a
  // bare join leaves one blank line between labeled sections.
  return sections.map(([label, citation]) => `${label}\n${citation}`).join('\n');
}
