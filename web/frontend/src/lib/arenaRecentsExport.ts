/** Portable markdown for Arena sidebar recents (filtered session turns). */

import { formatIsoWhen } from './relativeTime';

export type ArenaRecentExportItem = {
  title?: string | null;
  prompt?: string | null;
  category?: string | null;
  winnerName?: string | null;
  timestamp?: string | null;
  turnId?: string | null;
};

function displayTitle(item: ArenaRecentExportItem): string {
  const title = (item.title || '').trim();
  if (title) return title;
  const prompt = (item.prompt || '').trim();
  if (prompt) return prompt.length > 120 ? `${prompt.slice(0, 119).trimEnd()}…` : prompt;
  return 'Untitled turn';
}

function categoryLabel(raw: string | null | undefined): string {
  const c = (raw || '').trim().toLowerCase();
  if (!c || c === 'all') return '';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function formatArenaRecentsExport(opts: {
  items: ArenaRecentExportItem[];
  totalCount?: number | null;
  filterNote?: string | null;
}): string {
  const items = opts.items || [];
  const lines: string[] = ['# Arena · Recents', ''];

  const total =
    typeof opts.totalCount === 'number' && Number.isFinite(opts.totalCount)
      ? opts.totalCount
      : null;
  if (total != null && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** turn${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** turns in this view`,
    );
    lines.push('');
  } else if (items.length > 0) {
    lines.push(`**${items.length}** turn${items.length === 1 ? '' : 's'}`);
    lines.push('');
  }

  const filterNote = (opts.filterNote || '').trim();
  if (filterNote) {
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push(
      filterNote
        ? '_No recent turns match this filter._'
        : '_No recent Arena turns yet._',
    );
    lines.push('');
  } else {
    items.forEach((item, i) => {
      const title = displayTitle(item);
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');

      const prompt = (item.prompt || '').trim();
      if (prompt && prompt !== title) {
        lines.push(`**Prompt:** ${prompt}`);
        lines.push('');
      }

      const meta: string[] = [];
      const cat = categoryLabel(item.category);
      if (cat) meta.push(cat);
      const winner = (item.winnerName || '').trim();
      if (winner) meta.push(`Winner: ${winner}`);
      const when = formatIsoWhen(item.timestamp);
      if (when) meta.push(when);
      if (meta.length > 0) {
        lines.push(`- ${meta.join(' · ')}`);
      }
      const turnId = (item.turnId || '').trim();
      if (turnId) {
        lines.push(`- _Turn \`${turnId}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena recents_');
  return lines.join('\n').trim() + '\n';
}

/**
 * JSON export of sidebar recents (full list or current filter).
 * Keeps the same normalized fields as the markdown snapshot so consumers can
 * round-trip titles, prompts, winners, and timestamps programmatically.
 */
export function formatArenaRecentsJsonExport(opts: {
  items: ArenaRecentExportItem[];
  totalCount?: number | null;
  filterNote?: string | null;
  exportedAt?: string;
}): string {
  const items = (opts.items || []).map((item) => ({
    title: displayTitle(item),
    prompt: (item.prompt || '').trim() || null,
    category: categoryLabel(item.category) || null,
    winnerName: (item.winnerName || '').trim() || null,
    timestamp: item.timestamp || null,
    turnId: (item.turnId || '').trim() || null,
  }));
  return JSON.stringify(
    {
      exported_from: 'arena',
      exported_at: opts.exportedAt || new Date().toISOString(),
      total_recents:
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


function toCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * CSV export of sidebar recents (full list or current filter).
 * The first row is headers; every cell is quoted so commas/newlines in
 * prompts cannot break the column layout.
 */
export function formatArenaRecentsCsvExport(opts: { items: ArenaRecentExportItem[] }): string {
  const items = (opts.items || []).map((item) => ({
    title: displayTitle(item),
    prompt: (item.prompt || '').trim() || '',
    category: categoryLabel(item.category) || '',
    winnerName: (item.winnerName || '').trim() || '',
    timestamp: item.timestamp || '',
    turnId: (item.turnId || '').trim() || '',
  }));
  const headers = [
    'title',
    'prompt',
    'category',
    'winnerName',
    'timestamp',
    'turnId',
  ];
  const lines: string[] = [headers.map(toCsvCell).join(',')];
  items.forEach((item) => {
    lines.push(
      [
        item.title,
        item.prompt,
        item.category,
        item.winnerName,
        item.timestamp,
        item.turnId,
      ]
        .map(toCsvCell)
        .join(','),
    );
  });
  return lines.join('\n') + '\n';
}

/**
 * Clipboard text for a single Arena recent turn (markdown snapshot).
 * Prefer full context over bare prompt so notes outside the app stay useful.
 */
export function formatArenaRecentItemCopy(item: ArenaRecentExportItem): string {
  const prompt = (item.prompt || '').trim();
  const rawTitle = (item.title || '').trim();
  // Require real content — do not invent "Untitled turn" for empty rows.
  if (!rawTitle && !prompt) return '';
  const title = displayTitle(item);

  const lines: string[] = [`# ${title}`, ''];

  if (prompt && prompt !== title) {
    lines.push(`**Prompt:** ${prompt}`);
    lines.push('');
  } else if (prompt) {
    lines.push(prompt);
    lines.push('');
  }

  const meta: string[] = [];
  const cat = categoryLabel(item.category);
  if (cat) meta.push(cat);
  const winner = (item.winnerName || '').trim();
  if (winner) meta.push(`Winner: ${winner}`);
  const when = formatIsoWhen(item.timestamp);
  if (when) meta.push(when);
  if (meta.length > 0) {
    lines.push(`- ${meta.join(' · ')}`);
  }
  const turnId = (item.turnId || '').trim();
  if (turnId) {
    lines.push(`- _Turn \`${turnId}\`_`);
  }

  lines.push('');
  lines.push('---');
  lines.push('_Shared from Arena recents_');
  return lines.join('\n').trim() + '\n';
}

/** Bare prompt only — for re-running in compose. */
export function formatArenaRecentPromptCopy(prompt: string): string {
  const q = (prompt || '').trim();
  return q ? `${q}\n` : '';
}
