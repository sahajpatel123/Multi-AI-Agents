/**
 * Build a compact Chicago-style bibliography entry for a public Agent report.
 *
 * This follows the Chicago bibliography pattern for a web resource: creator,
 * quoted title, site/report label, publication date, and stable URL. Keep it
 * provenance-only; the report body and private task/share fields never belong
 * in a citation that a reader pastes into a bibliography.
 */

function normalizeChicagoText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // Chicago output is plain text. Flatten user-authored control characters
    // before they can create misleading extra lines in a pasted citation.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a downloaded bibliography entry.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function chicagoDate(raw: string | null | undefined): string {
  const value = normalizeChicagoText(raw, 80);
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
  return `${months[month - 1]} ${day}, ${year}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeChicagoText(raw, 1000);
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

function quoteChicagoTitle(value: string): string {
  // Keep the entry structurally unambiguous when a public title contains
  // straight or curly double quotes of its own.
  const safeTitle = value.replace(/["“”]/g, '’');
  const terminalPunctuation = /[.!?]$/.test(safeTitle) ? '' : '.';
  return `“${safeTitle}${terminalPunctuation}”`;
}

/** Format a public Agent report as a plain-text Chicago bibliography entry. */
export function formatAgentReportChicago(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeChicagoText(opts.title) || normalizeChicagoText(opts.question) || 'Arena Agent report';
  const date = chicagoDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const parts = [`Arena. ${quoteChicagoTitle(title)} Arena Agent report`, date, url].filter(Boolean);

  return `${parts.join('. ')}.\n`;
}
