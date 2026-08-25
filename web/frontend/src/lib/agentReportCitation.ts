/**
 * Build a compact, shareable Markdown citation for a public Agent report.
 *
 * Keep this separate from the full report export: a citation should carry
 * provenance (title, question, public URL, and date) without copying the
 * report body or the private share token.
 */

function normalizeCitationText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // Citation output is plain text. Flatten user-authored control characters
    // before they can create misleading extra lines in a pasted block.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]+/g, ' ')
    // Remove invisible directional controls so untrusted text cannot reorder
    // what a reader sees in a copied attribution block.
    .replace(/[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function citationDate(raw: string | null | undefined): string {
  const value = normalizeCitationText(raw, 80);
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate || value;
}

function escapeMarkdownText(value: string): string {
  // Citation fields come from the public report payload. Escape inline
  // Markdown controls so a pasted citation remains one attribution block
  // even when a question or title contains formatting-like text.
  return value
    .replace(/[\\`*_<>~]/g, '\\$&')
    .split('[')
    .join('\\[')
    .split(']')
    .join('\\]');
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeCitationText(raw, 500);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    // Never copy credentials into a citation, even if this helper is reused
    // with a URL other than the current browser location.
    if (url.username || url.password) return '';
    // Keep the citation stable rather than preserving tracking parameters or
    // fragment-only client state, matching the RIS/IEEE exports.
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

export function formatAgentReportCitation(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title = normalizeCitationText(opts.title) || normalizeCitationText(opts.question) || 'Arena Agent report';
  const question = normalizeCitationText(opts.question);
  const url = safePublicUrl(opts.url);
  const date = citationDate(opts.sharedAt);
  const firstLine = url
    ? `[${escapeMarkdownText(title)}](<${url}>) — Arena Agent report.`
    : `**${escapeMarkdownText(title)}** — Arena Agent report.`;
  const lines = [firstLine];

  if (question && question !== title) lines.push(`Question: ${escapeMarkdownText(question)}`);
  if (date) lines.push(`Shared: ${escapeMarkdownText(date)}`);

  return `${lines.join('\n')}\n`;
}
