/**
 * Build a compact MLA 9-style citation for a public Agent report.
 *
 * Keep this provenance-only: the report body and private task/share fields do
 * not belong in a citation that a reader pastes into a works-cited list.
 */

function normalizeMlaText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // MLA output is plain text. Flatten user-authored controls so a title or
    // date cannot create misleading extra lines in a pasted citation.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a works-cited entry.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function mlaDate(raw: string | null | undefined): string {
  const value = normalizeMlaText(raw, 80);
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
  return `${day} ${months[month - 1]} ${year}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeMlaText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even when this helper is reused
    // with a URL other than the current browser location.
    if (url.username || url.password) return '';
    // A works-cited entry should be stable rather than preserving tracking
    // parameters or fragment-only client state from the current tab.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function quoteMlaTitle(value: string): string {
  // Use curly outer quotes and turn nested double quotes into apostrophes so a
  // user-authored title cannot make the citation look structurally ambiguous.
  const safeTitle = value.replace(/["“”]/g, '’');
  // MLA places the title's terminal punctuation before the closing quote. Do
  // not add a second period when the public title is already a question,
  // exclamation, or full-stop title.
  // A title may already carry its own comma. Avoid producing the visibly
  // malformed `,.` sequence while preserving MLA's terminal period.
  const terminalPunctuation = /[.!?,]$/.test(safeTitle) ? '' : '.';
  return `“${safeTitle}${terminalPunctuation}”`;
}

/** Format a public Agent report as a plain-text MLA 9-style citation. */
export function formatAgentReportMla(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title = normalizeMlaText(opts.title) || normalizeMlaText(opts.question) || 'Arena Agent report';
  const date = mlaDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const tail = ['Arena Agent report', date, url].filter(Boolean).join(', ');

  return `Arena. ${quoteMlaTitle(title)}${tail ? ` ${tail}` : ''}.\n`;
}
