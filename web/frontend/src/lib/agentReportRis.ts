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
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  // Keep malformed timestamps from becoming misleading RIS metadata. The
  // year must be positive, and month/day must describe a real calendar date.
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return '';
  }

  return `${match[1]}/${match[2]}/${match[3]}`;
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
    // Keep the formatter provenance-only even when it is called outside the
    // share page. Query strings and fragments can contain tracking values,
    // private state, or one-off client navigation that should not become part
    // of a stable reference-manager record.
    url.search = '';
    url.hash = '';
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
