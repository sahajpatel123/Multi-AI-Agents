/** Portable markdown for Agent Watchlist. */

import { formatIsoWhen } from './relativeTime';
import { readableAgentAnswerText } from './watchlistHistory';

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

export type WatchlistLatestResultLike = {
  question?: string | null;
  title?: string | null;
  finalAnswer?: string | null;
  finalScore?: number | null;
  finalConfidence?: number | null;
  createdAt?: string | null;
  taskId?: string | null;
};

/**
 * Clipboard markdown for a watch's latest completed research result.
 * The answer is flattened from structured Agent JSON when present so the
 * copied text is readable outside the app.
 */
export function formatWatchlistLatestResultCopy(
  item: WatchlistLatestResultLike,
): string {
  const q = (item.question || '').trim();
  const answer = readableAgentAnswerText(item.finalAnswer);
  if (!q || !answer) return '';

  const lines: string[] = [`# ${q}`, ''];
  const title = (item.title || '').trim();
  if (title) lines.push(`**Latest run:** ${title}`);
  const score =
    typeof item.finalScore === 'number' && Number.isFinite(item.finalScore)
      ? `${Math.round(item.finalScore)}/100`
      : '';
  const confidence =
    typeof item.finalConfidence === 'number' &&
    Number.isFinite(item.finalConfidence)
      ? `${Math.round(item.finalConfidence * 100)}%`
      : '';
  if (score || confidence) {
    lines.push(`**Score:** ${score || '—'} · **Confidence:** ${confidence || '—'}`);
  }
  if (item.createdAt) {
    lines.push(`**When:** ${formatIsoWhen(item.createdAt, { fallback: '—' })}`);
  }
  if (item.taskId) lines.push(`**Task:** \`${item.taskId}\``);
  lines.push('', '---', '', answer, '', '---', '_Shared from Arena Agent Watchlist_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Markdown digest of every completed latest result in the current
 * (already-filtered) watchlist view. Watches whose latest task has no
 * readable answer are skipped so a digest is never padded with "no data"
 * placeholders, and an entirely empty digest returns '' so callers can
 * surface a friendly "nothing to copy" message.
 */
export function formatWatchlistResultsDigest(opts: {
  items: WatchlistLatestResultLike[];
  activeCount?: number;
  activeCap?: number;
  filterNote?: string;
}): string {
  const results = (opts.items || [])
    .map((item) => ({
      question: (item.question || '').trim(),
      title: (item.title || '').trim(),
      answer: readableAgentAnswerText(item.finalAnswer),
      finalScore: item.finalScore,
      createdAt: item.createdAt,
      taskId: item.taskId,
    }))
    .filter((item) => item.question && item.answer);

  if (results.length === 0) return '';

  const lines: string[] = ['# Agent Watchlist — Results Digest', ''];
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

  results.forEach((item, i) => {
    lines.push(`## ${i + 1}. ${item.question}`);
    lines.push('');
    if (item.title) lines.push(`**Latest run:** ${item.title}`);
    if (typeof item.finalScore === 'number' && Number.isFinite(item.finalScore)) {
      lines.push(`**Score:** ${Math.round(item.finalScore)}/100`);
    }
    if (item.createdAt) {
      lines.push(`**When:** ${formatIsoWhen(item.createdAt, { fallback: '—' })}`);
    }
    if (item.taskId) lines.push(`**Task:** \`${item.taskId}\``);
    lines.push('', item.answer, '');
  });

  lines.push('---', '_Shared from Arena Agent Watchlist_');
  return lines.join('\n').trim() + '\n';
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

/**
 * JSON export of the current watchlist view.
 *
 * Mirrors the CSV field set normalized to snake_case so a downloaded JSON
 * file can be dropped into scripts without a second mapping step, and uses
 * the same machine-readable envelope as the other Arena JSON exports
 * (exported_from, filter_note, count). Includes export timestamp,
 * active-count context, and any filter note so the file is self-describing
 * outside the app.
 */
export function formatWatchlistJsonExport(opts: {
  items: WatchlistExportItem[];
  activeCount?: number;
  activeCap?: number;
  filterNote?: string;
  exportedAt?: string;
}): string {
  const items = (opts.items || []).map((item) => ({
    question: (item.question || '').trim() || '(untitled question)',
    status: item.isActive ? 'active' : 'paused',
    cadence_hours:
      typeof item.intervalHours === 'number' && Number.isFinite(item.intervalHours)
        ? Math.max(0, Math.floor(item.intervalHours))
        : null,
    runs:
      typeof item.runCount === 'number' && Number.isFinite(item.runCount)
        ? Math.max(0, Math.floor(item.runCount))
        : null,
    last_run_at: item.lastRunAt || null,
    next_run_at: item.isActive && item.nextRunAt ? item.nextRunAt : null,
    latest_title: (item.latestTitle || '').trim() || null,
    latest_score:
      typeof item.latestScore === 'number' && Number.isFinite(item.latestScore)
        ? Math.round(item.latestScore)
        : null,
    expertise_level: (item.expertiseLevel || '').trim() || null,
    expertise_domain: (item.expertiseDomain || '').trim() || null,
  }));

  const payload: Record<string, unknown> = {
    exported_from: 'arena',
    exported_at: opts.exportedAt || new Date().toISOString(),
    active_count:
      typeof opts.activeCount === 'number' && Number.isFinite(opts.activeCount)
        ? opts.activeCount
        : null,
    active_cap:
      typeof opts.activeCap === 'number' && Number.isFinite(opts.activeCap)
        ? opts.activeCap
        : null,
    filter_note: (opts.filterNote || '').trim() || null,
    count: items.length,
    items,
  };

  return JSON.stringify(payload, null, 2) + '\n';
}
