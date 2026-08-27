/** Portable markdown for Agent Mode research history (list view). */

import { formatIsoWhen } from './relativeTime';

export type AgentHistoryExportItem = {
  title?: string | null;
  question?: string | null;
  score?: number | null;
  confidence?: number | null;
  createdAt?: string | null;
  topics?: string[] | null;
  isLive?: boolean;
  taskId?: string | null;
  userFeedback?: string | null;
  orchestrationId?: string | null;
  watchlistItemId?: string | null;
};

function displayTitle(item: AgentHistoryExportItem): string {
  const title = (item.title || '').trim();
  if (title) return title;
  const q = (item.question || '').trim();
  if (q) return q.length > 120 ? `${q.slice(0, 119).trimEnd()}…` : q;
  return 'Untitled research';
}

const MARKDOWN_ESCAPE_PATTERN = /([\\`*_{}[\]()#+!>|~<\-=])/g;

/**
 * Escape user- and model-controlled text before placing it in Markdown.
 * Without this, a copied history title or question could inject headings,
 * links, HTML, list items, or thematic breaks into the exported snapshot.
 */
function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE_PATTERN, '\\$1');
}

function markdownCodeText(text: string): string {
  // Backticks terminate an inline code span and line breaks make task ids
  // spill into the surrounding document. Task ids are opaque identifiers, so
  // removing those delimiters and flattening line breaks is the safest output.
  return text.replace(/`/g, '').replace(/[\r\n]+/g, ' ');
}

export function formatAgentHistoryExport(opts: {
  items: AgentHistoryExportItem[];
  totalCount?: number;
  filterNote?: string;
}): string {
  const lines: string[] = ['# Agent research history', ''];

  const total = opts.totalCount;
  const items = opts.items || [];
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** task${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** tasks in this view`,
    );
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${escapeMarkdown(filterNote)}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('_No research tasks in this view._');
  } else {
    items.forEach((item, i) => {
      const title = displayTitle(item);
      lines.push(`## ${i + 1}. ${escapeMarkdown(title)}`);
      lines.push('');
      const q = (item.question || '').trim();
      if (q && q !== title) {
        lines.push(`**Question:** ${escapeMarkdown(q)}`);
        lines.push('');
      }
      const meta: string[] = [];
      if (typeof item.score === 'number' && Number.isFinite(item.score)) {
        meta.push(`Score ${Math.round(item.score)}/100`);
      }
      if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
        const c =
          item.confidence <= 1
            ? `${Math.round(item.confidence * 100)}%`
            : `${Math.round(item.confidence)}%`;
        meta.push(`Confidence ${c}`);
      }
      if (item.isLive) meta.push('Live');
      if (item.createdAt) meta.push(formatIsoWhen(item.createdAt, { fallback: '—' }));
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }
      const topics = (item.topics || []).map((t) => (t || '').trim()).filter(Boolean);
      if (topics.length > 0) {
        lines.push(`- **Topics:** ${escapeMarkdown(topics.join(', '))}`);
      }
      const taskId = (item.taskId || '').trim();
      if (taskId) {
        lines.push(`- _Task \`${markdownCodeText(taskId)}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent history_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Clipboard text for a single Agent history row.
 * Prefer a useful research snapshot (question + score + topics) over
 * the bare question so notes outside the app stay meaningful.
 */
export function formatAgentHistoryItemCopy(item: AgentHistoryExportItem): string {
  const question = (item.question || '').trim();
  const title = displayTitle(item);
  if (!question && !(item.title || '').trim()) return '';

  const lines: string[] = [`# ${escapeMarkdown(title)}`, ''];

  if (question && question !== title) {
    lines.push(`**Question:** ${escapeMarkdown(question)}`);
    lines.push('');
  } else if (question) {
    lines.push(escapeMarkdown(question));
    lines.push('');
  }

  const meta: string[] = [];
  if (typeof item.score === 'number' && Number.isFinite(item.score)) {
    meta.push(`Score ${Math.round(item.score)}/100`);
  }
  if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
    const c =
      item.confidence <= 1
        ? `${Math.round(item.confidence * 100)}%`
        : `${Math.round(item.confidence)}%`;
    meta.push(`Confidence ${c}`);
  }
  if (item.isLive) meta.push('Live');
  if (item.createdAt) meta.push(formatIsoWhen(item.createdAt, { fallback: '—' }));
  if (meta.length > 0) {
    lines.push(`- ${meta.join(' · ')}`);
  }
  const topics = (item.topics || []).map((t) => (t || '').trim()).filter(Boolean);
  if (topics.length > 0) {
    lines.push(`- **Topics:** ${escapeMarkdown(topics.join(', '))}`);
  }
  const taskId = (item.taskId || '').trim();
  if (taskId) {
    lines.push(`- _Task \`${markdownCodeText(taskId)}\`_`);
  }

  lines.push('');
  lines.push('---');
  lines.push('_Shared from Arena Agent history_');
  return lines.join('\n').trim() + '\n';
}

/**
 * CSV export for the current Agent research history view.
 *
 * Cells are quoted when they contain commas, quotes, or line breaks, and any
 * cell whose first significant character is a spreadsheet formula trigger is
 * neutralized with a leading apostrophe (OWASP CWE-1236 defense, matching the
 * backend exports). The file starts with a UTF-8 BOM so Excel detects the
 * Unicode question text, and rows use CRLF line endings per RFC 4180.
 */
export function formatAgentHistoryCsv(opts: { items: AgentHistoryExportItem[] }): string {
  const CSV_FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];

  const csvTopics = (topics: AgentHistoryExportItem['topics']): string => {
    // Treat runtime data defensively: the API contract is string[], but a
    // malformed topic must not make a valid history row uncopyable.
    if (!Array.isArray(topics)) return '';
    return topics
      .map((topic) => (typeof topic === 'string' ? topic.trim() : ''))
      .filter(Boolean)
      .join('; ');
  };

  const csvSafe = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    // Spreadsheets commonly ignore leading whitespace before deciding whether
    // a cell is a formula, so neutralize the first significant character, not
    // just the raw first byte.
    const firstSignificant = s.trimStart()[0] || '';
    return firstSignificant && CSV_FORMULA_PREFIXES.includes(firstSignificant)
      ? `'${s}`
      : s;
  };

  const csvCell = (value: unknown): string => {
    const safe = csvSafe(value);
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  const header = [
    'task_id',
    'title',
    'question',
    'score',
    'confidence',
    'user_feedback',
    'created_at',
    'is_live',
    'topics',
    'orchestration_id',
    'watchlist_item_id',
  ];

  const rows = (opts.items || []).map((item) => [
    item.taskId,
    item.title,
    item.question,
    typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : '',
    typeof item.confidence === 'number' && Number.isFinite(item.confidence)
      ? item.confidence
      : '',
    item.userFeedback,
    item.createdAt,
    item.isLive === true ? 'true' : 'false',
    csvTopics(item.topics),
    item.orchestrationId,
    item.watchlistItemId,
  ]);

  return (
    '\uFEFF' +
    [header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join(
      '\r\n',
    ) +
    '\r\n'
  );
}

function historyJsonString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function historyJsonNullableString(value: unknown): string | null {
  const normalized = historyJsonString(value);
  return normalized || null;
}

function historyJsonTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((topic): topic is string => typeof topic === 'string')
    .map((topic) => topic.trim())
    .filter(Boolean);
}

/**
 * Normalize API-shaped history rows before serializing them.
 *
 * History is remote data at runtime even though the TypeScript contract is
 * narrower. Keeping this boundary tolerant means one malformed topic or
 * scalar cannot abort a selected export or produce a shape that differs from
 * the JSONL export.
 */
function formatAgentHistoryJsonRecord(item: AgentHistoryExportItem | null | undefined) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    task_id: historyJsonString(source.taskId),
    title: historyJsonString(source.title),
    question: historyJsonString(source.question),
    score:
      typeof source.score === 'number' && Number.isFinite(source.score) ? source.score : null,
    confidence:
      typeof source.confidence === 'number' && Number.isFinite(source.confidence)
        ? source.confidence
        : null,
    user_feedback: historyJsonNullableString(source.userFeedback),
    created_at: historyJsonString(source.createdAt),
    is_live: source.isLive === true,
    topics: historyJsonTopics(source.topics),
    orchestration_id: historyJsonNullableString(source.orchestrationId),
    watchlist_item_id: historyJsonNullableString(source.watchlistItemId),
  };
}

/**
 * JSON export for the current Agent research history view.
 *
 * Keeps the same field names the backend history API uses so the file can be
 * dropped into scripts and spreadsheets without a second mapping step.
 */
export function formatAgentHistoryJson(opts: {
  items: AgentHistoryExportItem[];
  totalCount?: number;
  filterNote?: string;
  exportedAt?: string;
}): string {
  const items = (Array.isArray(opts?.items) ? opts.items : []).map((item) =>
    formatAgentHistoryJsonRecord(item),
  );

  const total = opts?.totalCount;
  const payload: Record<string, unknown> = {
    exported_at: opts?.exportedAt || new Date().toISOString(),
  };
  if (typeof total === 'number' && Number.isFinite(total)) payload.total = total;
  const filterNote = historyJsonString(opts?.filterNote);
  if (filterNote) payload.filter_note = filterNote;
  payload.items = items;

  return JSON.stringify(payload, null, 2) + '\n';
}

/**
 * JSONL export for the current Agent research history view.
 *
 * Each retained task is a complete JSON object on its own line, so filtered
 * history can be streamed into command-line tools without unwrapping a JSON
 * document first. An empty view intentionally produces an empty file.
 */
export function formatAgentHistoryJsonl(opts: {
  items: AgentHistoryExportItem[];
}): string {
  const items = Array.isArray(opts?.items) ? opts.items : [];
  const lines = items.map((item) => JSON.stringify(formatAgentHistoryJsonRecord(item)));

  return lines.length ? `${lines.join('\n')}\n` : '';
}
