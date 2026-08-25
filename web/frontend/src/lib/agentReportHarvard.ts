/**
 * Build a compact Harvard-style web citation for a public Agent report.
 *
 * Harvard has institutional variants, so this deliberately stays a
 * provenance-only, human-readable style rather than pretending to be a
 * reference-manager schema. The report body and private share token never
 * belong in a bibliography entry.
 */

function normalizeHarvardText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // Citation output is plain text. Flatten user-authored controls before
    // they can create misleading extra lines in a pasted bibliography entry.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a copied citation.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function harvardDate(raw: string | null | undefined): { year: string; accessed: string } {
  const value = normalizeHarvardText(raw, 80);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { year: 'n.d.', accessed: '' };

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
    return { year: 'n.d.', accessed: '' };
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
  return { year: String(year), accessed: `${day} ${months[month - 1]} ${year}` };
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeHarvardText(raw, 1000);
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

function quoteHarvardTitle(value: string): string {
  // Curly single quotes make the entry readable while converting authored
  // apostrophes avoids an ambiguous closing quote in a pasted citation.
  const safeTitle = value.replace(/[\u0027\u2018\u2019]/g, '’');
  return `‘${safeTitle}’`;
}

/** Format a public Agent report as a plain-text Harvard-style citation. */
export function formatAgentReportHarvard(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeHarvardText(opts.title) || normalizeHarvardText(opts.question) || 'Arena Agent report';
  const { year, accessed } = harvardDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const separator = /[.!?,]$/.test(title) ? ' ' : ', ';
  const base = `Arena (${year}) ${quoteHarvardTitle(title)}${separator}Arena Agent report`;

  if (!url) return `${base}.\n`;
  const accessNote = accessed ? ` (Accessed: ${accessed})` : '';
  return `${base}. Available at: ${url}${accessNote}.\n`;
}
