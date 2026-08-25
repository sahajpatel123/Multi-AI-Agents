/**
 * Build a compact RIS citation for a public Agent report.
 *
 * RIS is useful for Zotero, EndNote, and other reference managers that do
 * not consume BibTeX directly. Keep the export provenance-only: the report
 * body and the private task/share fields never belong in a citation.
 */

function normalizeRisText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // RIS is line-oriented; flatten user-authored values so they cannot
    // masquerade as additional tags in a downloaded citation.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function risDate(raw: string | null | undefined): string {
  const value = normalizeRisText(raw, 80);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : '';
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeRisText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even when this helper is
    // reused with a URL other than the current browser location.
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function risField(tag: string, value: string): string {
  return `${tag.padEnd(2, ' ')}  - ${value}`;
}

/** Format a public Agent report as a compact RIS electronic-resource record. */
export function formatAgentReportRis(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeRisText(opts.title) || normalizeRisText(opts.question) || 'Arena Agent report';
  const question = normalizeRisText(opts.question);
  const date = risDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const lines = [
    risField('TY', 'ELEC'),
    risField('AU', 'Arena'),
    risField('TI', title),
    risField('T2', 'Arena Agent report'),
    risField('PB', 'Arena'),
  ];

  if (date) {
    lines.push(risField('PY', date.slice(0, 4)));
    lines.push(risField('DA', date));
  }
  if (url) lines.push(risField('UR', url));

  const note = question && question !== title
    ? `Arena Agent report. Question: ${question}`
    : 'Arena Agent report.';
  lines.push(risField('N1', note));
  lines.push(risField('ER', ''));
  return `${lines.join('\n')}\n`;
}
