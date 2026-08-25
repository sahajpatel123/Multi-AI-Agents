/**
 * Build a compact BibTeX entry for a public Agent report.
 *
 * This is intentionally separate from the Markdown citation: BibTeX has its
 * own escaping rules and should carry provenance without copying the report
 * body or any private task fields.
 */

function normalizeBibtexText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // BibTeX output is plain text. Flatten user-authored control characters
    // before they can create misleading extra lines in a downloaded entry.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a pasted .bib file (Trojan Source style).
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function bibtexDate(raw: string | null | undefined): string {
  // Only accept an ISO calendar date or timestamp. Matching just the date
  // prefix would turn malformed metadata such as `2026-02-28-draft` into a
  // misleading publication date in an imported bibliography entry.
  const match = normalizeBibtexText(raw, 80).match(
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

  // Keep malformed timestamps from becoming misleading BibTeX metadata.
  // RIS and CSL-JSON apply the same calendar validation for this bundle.
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

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeBibtexText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    // Keep the entry stable rather than preserving tracking parameters or
    // fragment-only client state, matching the other citation exports.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function escapeBibtexValue(value: string): string {
  // Escape characters that BibTeX treats as syntax. Keep the tilde/caret
  // macros last so the braces introduced by those macros remain valid.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([{}%$&#_])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function bibtexKeyFingerprint(value: string): string {
  // BibTeX keys must be stable across copies, but two reports can share a
  // title and date. An opaque short fingerprint keeps the key useful to a
  // reader without copying the report's share token into the key.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function entryKey(title: string, date: string, identity: string): string {
  const titlePart = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/g, '');
  const datePart = date ? date.replace(/-/g, '') : 'undated';
  return `arena_${titlePart || 'agent_report'}_${datePart}_${bibtexKeyFingerprint(identity)}`;
}

/**
 * Format a public Agent report as a BibLaTeX-compatible `@online` entry.
 * Unsafe URLs are omitted and downgrade the entry to `@misc` rather than
 * copying a potentially executable or credential-bearing value.
 */
export function formatAgentReportBibtex(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title =
    normalizeBibtexText(opts.title) ||
    normalizeBibtexText(opts.question) ||
    'Arena Agent report';
  const question = normalizeBibtexText(opts.question);
  const date = bibtexDate(opts.sharedAt);
  const url = safePublicUrl(opts.url);
  const type = url ? 'online' : 'misc';
  const identity = url || [title, question, date].join('\u0000');
  const lines = [
    `@${type}{${entryKey(title, date, identity)},`,
    '  author = {{Arena}},',
    `  title = {${escapeBibtexValue(title)}},`,
  ];

  if (date) {
    lines.push(`  year = {${date.slice(0, 4)}},`);
    lines.push(`  date = {${date}},`);
  }
  if (url) lines.push(`  url = {${escapeBibtexValue(url)}},`);

  const note = question && question !== title
    ? `Arena Agent report. Question: ${question}`
    : 'Arena Agent report.';
  lines.push(`  note = {${escapeBibtexValue(note)}},`);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
