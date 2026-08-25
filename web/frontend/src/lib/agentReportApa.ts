/**
 * Build a compact APA 7-style webpage citation for a public Agent report.
 *
 * Keep this provenance-only: the report body and private task/share fields do
 * not belong in a citation that a reader pastes into a bibliography.
 */

function normalizeApaText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // APA output is plain text, so flatten user-authored control characters
    // before they can create misleading extra lines in a pasted citation.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function apaDate(raw: string | null | undefined): string {
  const value = normalizeApaText(raw, 80);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'n.d.';

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

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return 'n.d.';
  }

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${year}, ${months[month - 1]} ${day}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeApaText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even if this helper is reused
    // with a URL other than the current browser location.
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Format a public Agent report as a plain-text APA 7-style citation. */
export function formatAgentReportApa(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeApaText(opts.title) || normalizeApaText(opts.question) || 'Arena Agent report';
  const url = safePublicUrl(opts.url);
  const location = url ? ` ${url}` : '';

  return `Arena. (${apaDate(opts.sharedAt)}). ${title} [AI-generated research report]. Arena.${location}\n`;
}
