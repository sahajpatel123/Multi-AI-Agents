/**
 * Build a compact BibTeX entry for a public Agent report.
 *
 * This is intentionally separate from the Markdown citation: BibTeX has its
 * own escaping rules and should carry provenance without copying the report
 * body or any private task fields.
 */

function normalizeBibtexText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function bibtexDate(raw: string | null | undefined): string {
  return normalizeBibtexText(raw, 80).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeBibtexText(raw, 1000);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
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

function entryKey(title: string, date: string): string {
  const titlePart = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/g, '');
  const datePart = date ? date.replace(/-/g, '') : 'undated';
  return `arena_${titlePart || 'agent_report'}_${datePart}`;
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
  const lines = [
    `@${type}{${entryKey(title, date)},`,
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
