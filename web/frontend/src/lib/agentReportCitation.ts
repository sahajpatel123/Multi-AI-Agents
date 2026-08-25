/**
 * Build a compact, shareable Markdown citation for a public Agent report.
 *
 * Keep this separate from the full report export: a citation should carry
 * provenance (title, question, public URL, and date) without copying the
 * report body or the private share token.
 */

function normalizeCitationText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function citationDate(raw: string | null | undefined): string {
  const value = normalizeCitationText(raw, 80);
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return isoDate || value;
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\\[\]]/g, '\\$&');
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeCitationText(raw, 500);
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
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
    ? `[${escapeMarkdownLabel(title)}](${url}) — Arena Agent report.`
    : `**${title}** — Arena Agent report.`;
  const lines = [firstLine];

  if (question && question !== title) lines.push(`Question: ${question}`);
  if (date) lines.push(`Shared: ${date}`);

  return `${lines.join('\n')}\n`;
}
