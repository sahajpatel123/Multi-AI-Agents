/**
 * Build a compact IEEE-style web citation for a public Agent report.
 *
 * Keep this provenance-only: the report body and private task/share fields do
 * not belong in a citation that a reader pastes into a bibliography.
 */

function normalizeIeeeText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // Flatten user-authored controls before they can create misleading extra
    // lines in a pasted citation.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a downloaded bibliography entry.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function ieeeDate(raw: string | null | undefined): string {
  const value = normalizeIeeeText(raw, 80);
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

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return '';
  }

  const months = [
    'Jan.',
    'Feb.',
    'Mar.',
    'Apr.',
    'May',
    'June',
    'July',
    'Aug.',
    'Sept.',
    'Oct.',
    'Nov.',
    'Dec.',
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeIeeeText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even when this helper is reused
    // with a URL other than the current browser location.
    if (url.username || url.password) return '';
    // Keep the bibliography entry stable rather than preserving tracking
    // parameters or fragment-only client state from the current tab.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function quoteIeeeTitle(value: string): string {
  // Preserve readable nested quotations without allowing a title to make the
  // citation structure ambiguous.
  let nestedQuoteOpen = true;
  const safeTitle = value.replace(/["“”]/g, (mark) => {
    if (mark === '“') return '‘';
    if (mark === '”') return '’';
    const replacement = nestedQuoteOpen ? '‘' : '’';
    nestedQuoteOpen = !nestedQuoteOpen;
    return replacement;
  });
  const terminalPunctuation = /[.!?]$/.test(safeTitle) ? '' : ',';
  return `“${safeTitle}${terminalPunctuation}”`;
}

/** Format a public Agent report as a plain-text IEEE-style citation. */
export function formatAgentReportIeee(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeIeeeText(opts.title) || normalizeIeeeText(opts.question) || 'Arena Agent report';
  const date = ieeeDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  // IEEE separates the site label from the date with a comma
  // ("TechTarget, Mar. 2021."), so only join the date onto the label then.
  const descriptor = date ? `Arena Agent report, ${date}` : 'Arena Agent report';
  const citationParts = [`Arena, ${quoteIeeeTitle(title)}`, descriptor];

  // Never terminate a URL with a period: readers and citation managers can
  // mistake it for part of the address. The bracketed fallback keeps its own.
  const availability = url ? `[Online]. Available: ${url}` : '[Online].';

  return `${citationParts.join(' ')}. ${availability}
`;
}
