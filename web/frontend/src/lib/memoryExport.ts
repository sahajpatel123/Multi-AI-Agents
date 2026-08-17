import type { MemorySummary } from '../types';

/**
 * Keep memory CSV exports safe to open in spreadsheet applications.
 * Summary text and topic labels can be model- or user-controlled, so a cell
 * that starts with a formula trigger must be prefixed before it is quoted.
 */
const CSV_FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const firstSignificant = raw.trimStart()[0] || '';
  const safe = CSV_FORMULA_PREFIXES.includes(firstSignificant) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Render the selected, detail-hydrated Memory summaries as a portable CSV.
 * Every field is quoted so commas and line breaks in model-generated text
 * remain inside their columns. The BOM and CRLF rows make the file open
 * cleanly in Excel while retaining Unicode persona/topic text.
 */
export function formatMemorySelectionCsv(summaries: MemorySummary[]): string {
  const headers = [
    'id',
    'session_id',
    'dominant_category',
    'preferred_depth',
    'trusted_persona',
    'exchange_count',
    'raw_exchanges_count',
    'compressed_at',
    'created_at',
    'main_topics',
    'session_summary',
    'key_positions_taken',
  ];

  const rows = (summaries || []).map((summary) => [
    summary.id,
    summary.session_id,
    summary.dominant_category,
    summary.preferred_depth,
    summary.trusted_persona,
    summary.exchange_count,
    summary.raw_exchanges_count ?? '',
    summary.compressed_at,
    summary.created_at,
    Array.isArray(summary.main_topics) ? summary.main_topics.join('; ') : '',
    summary.session_summary,
    Array.isArray(summary.key_positions_taken)
      ? JSON.stringify(summary.key_positions_taken)
      : '',
  ]);

  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}
