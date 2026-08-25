/**
 * Build a compact CSL-JSON citation for a public Agent report.
 *
 * CSL-JSON is accepted by many reference managers. Keep the record
 * provenance-only: the report body and private task/share fields never
 * belong in a citation export.
 */

function normalizeCslText(raw: string | null | undefined, max = 240): string {
  return String(raw ?? '')
    // JSON strings can safely contain newlines, but flattening user-authored
    // metadata keeps imported records readable and bounded.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cslDate(raw: string | null | undefined): number[] | null {
  const value = normalizeCslText(raw, 80);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

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
    return null;
  }

  return [year, month, day];
}

function safePublicUrl(raw: string | null | undefined): string {
  const value = normalizeCslText(raw, 1000);
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

/** Format a public Agent report as a CSL-JSON item array. */
export function formatAgentReportCslJson(opts: {
  title?: string | null;
  question?: string | null;
  url?: string | null;
  sharedAt?: string | null;
}): string {
  const title = normalizeCslText(opts.title) || normalizeCslText(opts.question) || 'Arena Agent report';
  const question = normalizeCslText(opts.question);
  const url = safePublicUrl(opts.url);
  const issued = cslDate(opts.sharedAt);
  const note = question && question !== title
    ? `Arena Agent report. Question: ${question}`
    : 'Arena Agent report.';

  const item: Record<string, unknown> = {
    type: 'webpage',
    author: [{ literal: 'Arena' }],
    title,
    'container-title': 'Arena Agent report',
    publisher: 'Arena',
    note,
  };

  if (issued) item.issued = { 'date-parts': [issued] };
  if (url) item.URL = url;

  return `${JSON.stringify([item], null, 2)}\n`;
}
