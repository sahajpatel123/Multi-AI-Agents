/** Portable markdown for Agent Watchlist. */

import { formatIsoWhen } from './relativeTime';

export type WatchlistExportItem = {
  question: string;
  intervalHours: number;
  isActive: boolean;
  runCount?: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  latestTitle?: string | null;
  latestScore?: number | null;
  expertiseLevel?: string | null;
  expertiseDomain?: string | null;
};

function cadenceLabel(hours: number): string {
  if (hours === 168) return 'Weekly (7d)';
  if (hours === 72) return 'Every 3 days';
  if (hours === 24) return 'Daily (24h)';
  if (Number.isFinite(hours) && hours > 0) return `Every ${hours}h`;
  return 'Custom cadence';
}

export function formatWatchlistExport(opts: {
  items: WatchlistExportItem[];
  activeCount?: number;
  activeCap?: number;
  /** e.g. search query or status filter applied in the UI */
  filterNote?: string;
}): string {
  const lines: string[] = [
    '# Agent Watchlist',
    '',
  ];

  const activeCount = opts.activeCount;
  const activeCap = opts.activeCap;
  if (typeof activeCount === 'number' && typeof activeCap === 'number') {
    lines.push(`**Active:** ${activeCount} / ${activeCap}`);
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  const items = opts.items || [];
  if (items.length === 0) {
    lines.push('_No watched tasks in this view._');
  } else {
    items.forEach((item, i) => {
      const q = (item.question || '').trim() || '(untitled question)';
      const status = item.isActive ? 'Active' : 'Paused';
      lines.push(`## ${i + 1}. ${q}`);
      lines.push('');
      lines.push(`- **Status:** ${status}`);
      lines.push(`- **Cadence:** ${cadenceLabel(item.intervalHours)}`);
      if (typeof item.runCount === 'number' && Number.isFinite(item.runCount)) {
        lines.push(`- **Runs:** ${Math.max(0, Math.floor(item.runCount))}`);
      }
      if (item.lastRunAt) {
        lines.push(`- **Last run:** ${formatIsoWhen(item.lastRunAt, { fallback: '—' })}`);
      }
      if (item.nextRunAt && item.isActive) {
        lines.push(`- **Next run:** ${formatIsoWhen(item.nextRunAt, { fallback: '—' })}`);
      }
      const domain = (item.expertiseDomain || '').trim();
      const level = (item.expertiseLevel || '').trim();
      if (domain || level) {
        lines.push(`- **Expertise:** ${[level, domain].filter(Boolean).join(' · ')}`);
      }
      const title = (item.latestTitle || '').trim();
      if (title) {
        const score =
          typeof item.latestScore === 'number' && Number.isFinite(item.latestScore)
            ? ` (${Math.round(item.latestScore)}/100)`
            : '';
        lines.push(`- **Latest:** ${title}${score}`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent Watchlist_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Clipboard text for a single watched question.
 * Prefer the full card snapshot (status, cadence, latest) over the bare
 * question so a shared note stays useful outside the app.
 */
export function formatWatchlistItemCopy(item: WatchlistExportItem): string {
  const q = (item.question || '').trim();
  if (!q) return '';

  const lines: string[] = [
    `# ${q}`,
    '',
    `- **Status:** ${item.isActive ? 'Active' : 'Paused'}`,
    `- **Cadence:** ${cadenceLabel(item.intervalHours)}`,
  ];

  if (typeof item.runCount === 'number' && Number.isFinite(item.runCount)) {
    lines.push(`- **Runs:** ${Math.max(0, Math.floor(item.runCount))}`);
  }
  if (item.lastRunAt) {
    lines.push(`- **Last run:** ${formatIsoWhen(item.lastRunAt, { fallback: '—' })}`);
  }
  if (item.nextRunAt && item.isActive) {
    lines.push(`- **Next run:** ${formatIsoWhen(item.nextRunAt, { fallback: '—' })}`);
  }
  const domain = (item.expertiseDomain || '').trim();
  const level = (item.expertiseLevel || '').trim();
  if (domain || level) {
    lines.push(`- **Expertise:** ${[level, domain].filter(Boolean).join(' · ')}`);
  }
  const title = (item.latestTitle || '').trim();
  if (title) {
    const score =
      typeof item.latestScore === 'number' && Number.isFinite(item.latestScore)
        ? ` (${Math.round(item.latestScore)}/100)`
        : '';
    lines.push(`- **Latest:** ${title}${score}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('_Shared from Arena Agent Watchlist_');
  return lines.join('\n').trim() + '\n';
}

/** Bare question only — for re-prompting or pasting into compose. */
export function formatWatchlistQuestionCopy(question: string): string {
  const q = (question || '').trim();
  return q ? `${q}\n` : '';
}

/**
 * Characters that, when they appear as the first character of a CSV cell,
 * cause Excel / Google Sheets / LibreOffice to evaluate the cell as a
 * formula. OWASP CSV Injection guidance: prefix any cell that begins with
 * one of these with a single quote to neutralize the formula (CWE-1236).
 *
 * Watchlist questions and latest task titles are user- and model-controlled
 * text, so they must never be able to turn a downloaded CSV into an
 * executable spreadsheet payload for the next analyst who opens it.
 */
const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function toCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? '' : String(value);
  // Check the first significant character so a formula trigger hidden behind
  // leading whitespace still gets neutralized (spreadsheets often ignore
  // leading whitespace before deciding whether a cell is a formula).
  const firstSignificant = (raw.trimStart())[0] || '';
  const safe = CSV_FORMULA_PREFIXES.includes(firstSignificant) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * CSV export of the current watchlist view — one row per watched task.
 * The first row is headers; every cell is quoted so commas/newlines in
 * question or latest-task text cannot break the column layout. Filter
 * context is deliberately kept out of the CSV so every row matches the
 * header schema exactly (the Markdown export carries the filter note).
 * The file starts with a UTF-8 BOM so Excel detects Unicode, and rows use
 * CRLF line endings per RFC 4180.
 */
export function formatWatchlistCsvExport(items: WatchlistExportItem[]): string {
  const headers = [
    'question',
    'status',
    'cadenceHours',
    'runs',
    'lastRunAt',
    'nextRunAt',
    'latestTitle',
    'latestScore',
    'expertiseLevel',
    'expertiseDomain',
  ];
  const lines: string[] = [headers.map(toCsvCell).join(',')];
  for (const item of items || []) {
    lines.push(
      [
        (item.question || '').trim() || '(untitled question)',
        item.isActive ? 'active' : 'paused',
        typeof item.intervalHours === 'number' && Number.isFinite(item.intervalHours)
          ? Math.max(0, Math.floor(item.intervalHours))
          : '',
        typeof item.runCount === 'number' && Number.isFinite(item.runCount)
          ? Math.max(0, Math.floor(item.runCount))
          : '',
        item.lastRunAt || '',
        item.isActive && item.nextRunAt ? item.nextRunAt : '',
        (item.latestTitle || '').trim(),
        typeof item.latestScore === 'number' && Number.isFinite(item.latestScore)
          ? Math.round(item.latestScore)
          : '',
        (item.expertiseLevel || '').trim(),
        (item.expertiseDomain || '').trim(),
      ]
        .map(toCsvCell)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
