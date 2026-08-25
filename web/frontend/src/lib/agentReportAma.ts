/**
 * Build a compact AMA-style web citation for a public Agent report.
 *
 * This stays provenance-only: the report body and private share token never
 * belong in a bibliography entry. The Internet marker and explicit publish
 * date make the generated text useful for medical and scientific references
 * without pretending to be a reference-manager record.
 */

function normalizeAmaText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // Flatten user-authored controls before they can create misleading extra
    // lines in a pasted bibliography entry.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a downloaded bibliography entry.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function amaDate(raw: string | null | undefined): string {
  const value = normalizeAmaText(raw, 80);
  // Only accept an ISO calendar date or timestamp. Matching just the date
  // prefix would turn malformed metadata such as `2026-02-28-draft` into a
  // misleading publication date in a pasted bibliography entry.
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))?)?$/,
  );
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

  if (match[4] !== undefined) {
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
    const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
    if (
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      offsetHour > 23 ||
      offsetMinute > 59
    ) {
      return '';
    }
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${year} ${months[month - 1]} ${day}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeAmaText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation.
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

function finishTitle(value: string): string {
  // Avoid a duplicate terminal period while preserving question, exclamation,
  // and comma titles exactly as authored.
  return /[.!?,]$/.test(value) ? value : `${value}.`;
}

/** Format a public Agent report as a plain-text AMA-style citation. */
export function formatAgentReportAma(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeAmaText(opts.title) || normalizeAmaText(opts.question) || 'Untitled report';
  const date = amaDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const published = date ? ` Published ${date}.` : '';
  const availability = url ? ` Available from: ${url}` : '';

  return `Arena. ${finishTitle(title)} Arena Agent report [Internet].${published}${availability}\n`;
}
