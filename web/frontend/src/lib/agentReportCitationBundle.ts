/**
 * Build a labeled bundle of the seven prose citation styles (AMA, APA,
 * Chicago, Harvard, IEEE, MLA, Vancouver) for a public Agent report.
 *
 * Writers often need the same source in several styles; copying each one
 * separately is tedious and error-prone. Each formatter already sanitizes
 * metadata and URLs identically, so the bundle simply labels their output.
 * Reference-manager formats (BibTeX, CSL-JSON, RIS) stay separate exports —
 * they are consumed by software, not pasted into documents.
 */

import { formatAgentReportAma } from './agentReportAma';
import { formatAgentReportApa } from './agentReportApa';
import { formatAgentReportChicago } from './agentReportChicago';
import { formatAgentReportHarvard } from './agentReportHarvard';
import { formatAgentReportIeee } from './agentReportIeee';
import { formatAgentReportMla } from './agentReportMla';
import { formatAgentReportVancouver } from './agentReportVancouver';

/** Format a public Agent report as a labeled multi-style citation bundle. */
export function formatAgentReportCitationBundle(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const sections: Array<[string, string]> = [
    ['AMA', formatAgentReportAma(opts)],
    ['APA', formatAgentReportApa(opts)],
    ['Chicago', formatAgentReportChicago(opts)],
    ['Harvard', formatAgentReportHarvard(opts)],
    ['IEEE', formatAgentReportIeee(opts)],
    ['MLA', formatAgentReportMla(opts)],
    ['Vancouver', formatAgentReportVancouver(opts)],
  ];

  // Keep the bundle layout stable even if a formatter later gains an extra
  // trailing blank line. This prevents labels from drifting away from their
  // citation and guarantees exactly one final newline for clipboard users.
  return sections
    .map(([label, citation]) => `${label}\n${citation.trimEnd()}\n`)
    .join('\n');
}
