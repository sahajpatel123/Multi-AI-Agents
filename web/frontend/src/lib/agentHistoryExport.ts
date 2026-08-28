/** Portable markdown for Agent Mode research history (list view). */

import { formatIsoWhen } from './relativeTime';
import { escapeHtml } from './agentReportHtml';

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

function historyText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayTitle(item: AgentHistoryExportItem): string {
  const title = historyText(item.title);
  if (title) return title;
  const q = historyText(item.question);
  if (q) return q.length > 120 ? `${q.slice(0, 119).trimEnd()}…` : q;
  return 'Untitled research';
}

function historyTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((topic): topic is string => typeof topic === 'string')
    .map((topic) => topic.trim())
    .filter(Boolean);
}

/**
 * Normalize remote history rows before rendering or copying them.
 *
 * History is remote data at runtime even though the TypeScript contract is
 * narrower. Keeping this boundary tolerant means one null row or malformed
 * scalar cannot make the rich HTML copy's Markdown fallback refuse the whole
 * view.
 */
function normalizeAgentHistoryItem(value: unknown): AgentHistoryExportItem {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  return {
    title: historyText(source.title),
    question: historyText(source.question),
    score:
      typeof source.score === 'number' && Number.isFinite(source.score) ? source.score : null,
    confidence:
      typeof source.confidence === 'number' && Number.isFinite(source.confidence)
        ? source.confidence
        : null,
    createdAt: historyText(source.createdAt),
    topics: historyTopics(source.topics),
    isLive: source.isLive === true,
    taskId: historyText(source.taskId),
    userFeedback: historyText(source.userFeedback),
    orchestrationId: historyText(source.orchestrationId),
    watchlistItemId: historyText(source.watchlistItemId),
  };
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

  const total = opts?.totalCount;
  const rawItems: unknown[] = Array.isArray(opts?.items) ? opts.items : [];
  const items = rawItems.map(normalizeAgentHistoryItem);
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** task${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** tasks in this view`,
    );
    lines.push('');
  }

  const filterNote = historyText(opts?.filterNote);
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
      const q = historyText(item.question);
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
      const topics = historyTopics(item.topics);
      if (topics.length > 0) {
        lines.push(`- **Topics:** ${escapeMarkdown(topics.join(', '))}`);
      }
      const taskId = historyText(item.taskId);
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

function htmlConfidence(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.min(100, Math.max(0, normalized)))}%`;
}

function historyHtmlMeta(item: AgentHistoryExportItem): string[] {
  const meta: string[] = [];
  if (typeof item.score === 'number' && Number.isFinite(item.score)) {
    meta.push(`<span><strong>Score</strong> ${Math.round(Math.min(100, Math.max(0, item.score)))}/100</span>`);
  }
  if (typeof item.confidence === 'number' && Number.isFinite(item.confidence)) {
    meta.push(`<span><strong>Confidence</strong> ${htmlConfidence(item.confidence)}</span>`);
  }
  if (item.isLive === true) meta.push('<span class="history-live">Live</span>');
  if (historyText(item.createdAt)) {
    meta.push(`<span><strong>Run</strong> ${escapeHtml(formatIsoWhen(item.createdAt, { fallback: '—' }))}</span>`);
  }
  if (historyText(item.userFeedback)) {
    meta.push(`<span><strong>Feedback</strong> ${escapeHtml(historyText(item.userFeedback))}</span>`);
  }
  return meta;
}

/** Format the current Agent history view as a self-contained offline HTML archive. */
export function formatAgentHistoryHtml(opts: {
  items: AgentHistoryExportItem[];
  totalCount?: number;
  filterNote?: string;
  exportedAt?: string;
}): string {
  const rawItems: unknown[] = Array.isArray(opts?.items) ? opts.items : [];
  const items = rawItems.map(normalizeAgentHistoryItem);
  const requestedTotal =
    typeof opts?.totalCount === 'number' && Number.isFinite(opts.totalCount)
      ? Math.max(0, Math.round(opts.totalCount))
      : null;
  // A malformed count must never claim that the archive contains more rows
  // than it actually can describe.
  const total = requestedTotal == null ? null : Math.max(items.length, requestedTotal);
  const countLabel =
    total != null && items.length !== total
      ? `${items.length} of ${total} tasks`
      : `${items.length} task${items.length === 1 ? '' : 's'}`;
  const filterNote = historyText(opts?.filterNote);
  const exportedAt = historyText(opts?.exportedAt) || new Date().toISOString();

  const cards = items
    .map((item, index) => {
      const title = displayTitle(item);
      const question = historyText(item.question);
      const topics = historyTopics(item.topics);
      const meta = historyHtmlMeta(item);
      const taskId = historyText(item.taskId);
      const questionBlock =
        question && question !== title
          ? `<p class="history-question"><strong>Question</strong>${escapeHtml(question)}</p>`
          : '';
      const topicsBlock =
        topics.length > 0
          ? `<div class="history-topics"><strong>Topics</strong>${topics
              .map((topic) => `<span>${escapeHtml(topic)}</span>`)
              .join('')}</div>`
          : '';
      const taskBlock = taskId
        ? `<p class="history-task"><strong>Task</strong><code>${escapeHtml(taskId)}</code></p>`
        : '';

      return `<article class="history-card">
  <header class="history-card__heading"><span class="history-card__number">${String(index + 1).padStart(2, '0')}</span><h2>${escapeHtml(title)}</h2></header>
  ${meta.length > 0 ? `<div class="history-meta">${meta.join('')}</div>` : ''}
  ${questionBlock}
  ${topicsBlock}
  ${taskBlock}
</article>`;
    })
    .join('\n');

  const emptyState =
    items.length === 0
      ? '<p class="history-empty">No research tasks in this view.</p>'
      : '';
  const filterBlock = filterNote
    ? `<p class="history-filter"><strong>Filtered view</strong>${escapeHtml(filterNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="generator" content="Arena Agent history">
  <title>Arena Agent research history</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: #f7f4ee; color: #2b211b; margin: 0; }
    main { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 48px 24px 64px; }
    header.page-heading { margin-bottom: 28px; }
    .eyebrow { color: #79583d; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { font-size: clamp(1.8rem, 5vw, 3rem); line-height: 1.1; margin: 8px 0 12px; }
    .summary { color: #79583d; margin: 0; }
    .history-filter { background: #fff8ef; border-left: 3px solid #b66f43; margin: 22px 0 0; padding: 10px 14px; white-space: pre-wrap; }
    .history-filter strong, .history-question strong, .history-topics strong, .history-task strong { display: block; font-size: .7rem; letter-spacing: .1em; margin-bottom: 5px; text-transform: uppercase; }
    .history-list { display: grid; gap: 16px; }
    .history-card { background: #fffdf9; border: 1px solid #e4d9cc; border-radius: 14px; box-shadow: 0 8px 28px rgba(66, 45, 28, .06); padding: 22px 24px; }
    .history-card__heading { align-items: baseline; display: flex; gap: 12px; }
    .history-card__number { color: #b66f43; font-size: .75rem; font-weight: 700; letter-spacing: .08em; }
    h2 { font-size: 1.15rem; line-height: 1.35; margin: 0; white-space: pre-wrap; }
    .history-meta { color: #79583d; display: flex; flex-wrap: wrap; font-size: .82rem; gap: 8px 16px; margin: 14px 0 0 28px; }
    .history-meta strong { color: #4f3a2b; font-weight: 700; }
    .history-live { color: #477957; font-weight: 700; }
    .history-question { border-left: 2px solid #d5b79d; line-height: 1.55; margin: 18px 0 0 28px; padding-left: 14px; white-space: pre-wrap; }
    .history-topics { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 0 28px; }
    .history-topics strong { margin: 0 4px 0 0; }
    .history-topics span { background: #f0e9e0; border-radius: 999px; color: #644b37; font-size: .78rem; padding: 4px 9px; }
    .history-task { color: #79583d; font-size: .78rem; margin: 16px 0 0 28px; }
    .history-task code { background: #f0e9e0; border-radius: 4px; display: inline-block; max-width: 100%; overflow-wrap: anywhere; padding: 3px 6px; }
    .history-empty { background: #fffdf9; border: 1px dashed #d5b79d; border-radius: 14px; color: #79583d; padding: 32px; text-align: center; }
    footer { border-top: 1px solid #e4d9cc; color: #79583d; font-size: .8rem; margin-top: 30px; padding-top: 14px; }
    @media print { body { background: #fff; } main { padding: 0; } .history-card { box-shadow: none; break-inside: avoid; } }
  </style>
</head>
<body>
  <main data-format="arena-agent-history" data-version="1">
    <header class="page-heading">
      <div class="eyebrow">Arena Agent</div>
      <h1>Research history</h1>
      <p class="summary">${escapeHtml(countLabel)}</p>
      ${filterBlock}
    </header>
    <section class="history-list" aria-label="Agent research history">
      ${emptyState || cards}
    </section>
    <footer>Exported ${escapeHtml(exportedAt)} · Shared from Arena Agent history</footer>
  </main>
</body>
</html>
`;
}
