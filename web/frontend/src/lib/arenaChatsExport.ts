/** Portable markdown/JSON/CSV snapshots for Arena sidebar resumable chats. */

import { formatIsoWhen } from './relativeTime';

export type ArenaChatExportItem = {
  sessionId?: string | null;
  title?: string | null;
  prompt?: string | null;
  topics?: readonly string[];
  primaryTopic?: string | null;
  turnCount?: number | null;
  pinned?: boolean;
  timestamp?: string | null;
};

function displayTitle(item: ArenaChatExportItem): string {
  const title = (item.title || '').trim();
  if (title) return title;
  const prompt = (item.prompt || '').trim();
  if (prompt) return prompt.length > 120 ? `${prompt.slice(0, 119).trimEnd()}…` : prompt;
  const primaryTopic = (item.primaryTopic || '').trim();
  if (primaryTopic) return primaryTopic;
  return 'Untitled chat';
}

function topicsText(item: ArenaChatExportItem): string {
  const topics = (item.topics || [])
    .map((topic) => (topic || '').trim())
    .filter(Boolean);
  if (topics.length > 0) return topics.join(', ');
  return (item.primaryTopic || '').trim();
}

function turnCountLabel(turnCount: number | null | undefined): string {
  if (typeof turnCount !== 'number' || !Number.isFinite(turnCount)) return '';
  return `${turnCount} ${turnCount === 1 ? 'turn' : 'turns'}`;
}

const MARKDOWN_ESCAPE_PATTERN = /([\\`*_{}[\]()#+!>|~<\-=])/g;

/**
 * Escape markdown-sensitive characters in user- and model-controlled text so
 * a prompt or title cannot inject headings, list items, links, images, or
 * thematic breaks into the exported snapshot. Session ids stay in inline
 * code and are handled separately because backslashes there would be literal.
 */
function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE_PATTERN, '\\$1');
}

/**
 * Markdown snapshot of the sidebar's resumable chats (full list or the
 * current search-filtered view). Titles, last prompts, topics, turn counts,
 * pinned state, and timestamps are included so the archive stays useful
 * outside the app.
 */
export function formatArenaChatsExport(opts: {
  items: ArenaChatExportItem[];
  totalCount?: number | null;
  filterNote?: string | null;
}): string {
  const items = opts.items || [];
  const lines: string[] = ['# Arena · Resumable Chats', ''];

  const total =
    typeof opts.totalCount === 'number' && Number.isFinite(opts.totalCount)
      ? opts.totalCount
      : null;
  if (total != null && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** chat${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** chats in this view`,
    );
    lines.push('');
  } else if (items.length > 0) {
    lines.push(`**${items.length}** chat${items.length === 1 ? '' : 's'}`);
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${escapeMarkdown(filterNote)}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push(
      filterNote
        ? '_No chats match this filter._'
        : '_No resumable chats yet._',
    );
    lines.push('');
  } else {
    items.forEach((item, i) => {
      lines.push(`## ${i + 1}. ${escapeMarkdown(displayTitle(item))}`);
      lines.push('');

      const prompt = (item.prompt || '').trim();
      if (prompt && prompt !== displayTitle(item)) {
        lines.push(`**Last prompt:** ${escapeMarkdown(prompt)}`);
        lines.push('');
      }

      const meta: string[] = [];
      const topics = topicsText(item);
      if (topics) meta.push(`Topics: ${escapeMarkdown(topics)}`);
      const turns = turnCountLabel(item.turnCount);
      if (turns) meta.push(turns);
      if (item.pinned === true) meta.push('Pinned');
      const when = formatIsoWhen(item.timestamp);
      if (when) meta.push(when);
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }
      const sessionId = (item.sessionId || '').trim();
      if (sessionId) {
        lines.push(`- _Chat \`${sessionId.replace(/`/g, '')}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena resumable chats_');
  return lines.join('\n').trim() + '\n';
}

/**
 * JSON export of sidebar resumable chats (full list or current filter).
 * Keeps normalized summary fields so consumers can round-trip titles,
 * last prompts, topics, and timestamps programmatically.
 */
export function formatArenaChatsJsonExport(opts: {
  items: ArenaChatExportItem[];
  totalCount?: number | null;
  filterNote?: string | null;
  exportedAt?: string;
}): string {
  const items = (opts.items || []).map((item) => {
    const title = (item.title || '').trim() || null;
    const topics = (item.topics || [])
      .map((topic) => (topic || '').trim())
      .filter(Boolean);
    return {
      session_id: (item.sessionId || '').trim() || null,
      title,
      prompt: (item.prompt || '').trim() || null,
      topics,
      // Keep stored fields verbatim so the JSON snapshot can round-trip
      // back into Arena. Display fallbacks (prompt/topic as title) belong
      // only to the human-readable markdown/CSV formats.
      primary_topic: (item.primaryTopic || '').trim() || null,
      turn_count:
        typeof item.turnCount === 'number' && Number.isFinite(item.turnCount)
          ? item.turnCount
          : null,
      pinned: item.pinned === true,
      timestamp: item.timestamp || null,
    };
  });
  return JSON.stringify(
    {
      exported_from: 'arena',
      exported_at: opts.exportedAt || new Date().toISOString(),
      total_chats:
        typeof opts.totalCount === 'number' && Number.isFinite(opts.totalCount)
          ? opts.totalCount
          : null,
      filter_note: (opts.filterNote || '').trim() || null,
      count: items.length,
      items,
    },
    null,
    2,
  ) + '\n';
}

/**
 * CSV export of sidebar resumable chats (full list or current filter).
 * Every cell is quoted so commas/newlines in prompts or topics cannot break
 * the column layout. User- and model-controlled text is neutralized against
 * spreadsheet formula injection (OWASP CWE-1236), matching recents/saved.
 * The file starts with a UTF-8 BOM so Excel detects Unicode prompts, and rows
 * use CRLF line endings per RFC 4180, matching watchlist/agent-history CSV.
 */
export function formatArenaChatsCsvExport(opts: {
  items: ArenaChatExportItem[];
}): string {
  const CSV_FORMULA_PREFIXES: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];

  const csvSafe = (value: string | number | boolean | null | undefined): string => {
    const raw = value == null ? '' : String(value);
    const firstSignificant = raw.trimStart()[0] || '';
    return CSV_FORMULA_PREFIXES.includes(firstSignificant) ? `'${raw}` : raw;
  };

  const csvCell = (value: string | number | boolean | null | undefined): string =>
    `"${csvSafe(value).replace(/"/g, '""')}"`;

  const items = (opts.items || []).map((item) => ({
    title: displayTitle(item),
    prompt: (item.prompt || '').trim(),
    topics: topicsText(item),
    primaryTopic: (item.primaryTopic || '').trim(),
    turnCount:
      typeof item.turnCount === 'number' && Number.isFinite(item.turnCount)
        ? item.turnCount
        : '',
    pinned: item.pinned === true ? 'true' : 'false',
    timestamp: item.timestamp || '',
    sessionId: (item.sessionId || '').trim(),
  }));
  const headers = [
    'title',
    'prompt',
    'topics',
    'primaryTopic',
    'turnCount',
    'pinned',
    'timestamp',
    'sessionId',
  ];
  const lines: string[] = [headers.map(csvCell).join(',')];
  items.forEach((item) => {
    lines.push(
      [
        item.title,
        item.prompt,
        item.topics,
        item.primaryTopic,
        item.turnCount,
        item.pinned,
        item.timestamp,
        item.sessionId,
      ]
        .map(csvCell)
        .join(','),
    );
  });
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
