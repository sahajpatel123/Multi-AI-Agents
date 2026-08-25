/**
 * Build a compact Vancouver/NLM-style web citation for a public Agent report.
 *
 * This is intentionally provenance-only. The report body and private share
 * token never belong in a citation that a reader pastes into a bibliography.
 */

function normalizeVancouverText(raw: string | null | undefined, max = 240): string {
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

function vancouverDate(raw: string | null | undefined): string {
  const value = normalizeVancouverText(raw, 80);
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

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${year} ${months[month - 1]} ${day}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeVancouverText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even if this helper is reused
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

function finishTitle(value: string): string {
  // Vancouver uses sentence-style titles. Avoid a duplicate terminal period
  // while keeping question and exclamation titles intact.
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/** Format a public Agent report as a plain-text Vancouver/NLM-style citation. */
export function formatAgentReportVancouver(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeVancouverText(opts.title) || normalizeVancouverText(opts.question) || 'Arena Agent report';
  const date = vancouverDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const datePart = date ? `; ${date}` : '';
  const urlPart = url ? `. Available from: ${url}` : '.';

  return `Arena. ${finishTitle(title)} [Internet]. Arena Agent report${datePart}${urlPart}\n`;
}
