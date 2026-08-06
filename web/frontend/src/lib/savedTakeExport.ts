/** Portable markdown for a bookmarked Arena take. */

import { formatIsoWhen } from './relativeTime';

export type SavedTakeListItem = {
  agentName?: string | null;
  prompt?: string | null;
  oneLiner?: string | null;
  verdict?: string | null;
  score?: number | null;
  timestamp?: string | null;
};

export function formatSavedTakeExport(opts: {
  agentName: string;
  prompt: string;
  oneLiner: string;
  verdict?: string;
  score?: number | null;
}): string {
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const prompt = (opts.prompt || '').trim() || '(no prompt)';
  const oneLiner = (opts.oneLiner || '').trim();
  const verdict = (opts.verdict || '').trim();
  const lines: string[] = [
    `# ${agentName} · Saved on Arena`,
    '',
    `**Question:** ${prompt}`,
    '',
  ];
  if (oneLiner) {
    lines.push(`> ${oneLiner}`);
    lines.push('');
  }
  if (verdict && verdict !== oneLiner) {
    lines.push('## Full take');
    lines.push('');
    lines.push(verdict);
    lines.push('');
  }
  if (typeof opts.score === 'number' && Number.isFinite(opts.score)) {
    lines.push(`_Score: ${Math.round(opts.score)}_`);
    lines.push('');
  }
  lines.push('---');
  lines.push('_Shared from Arena (saved take)_');
  return lines.join('\n').trim() + '\n';
}



/**
 * Bulk export of bookmarked takes (full list or current sidebar filter).
 */
export function formatSavedTakesListExport(opts: {
  items: SavedTakeListItem[];
  totalCount?: number | null;
  filterNote?: string | null;
}): string {
  const items = opts.items || [];
  const lines: string[] = ['# Arena · Saved takes', ''];

  const total =
    typeof opts.totalCount === 'number' && Number.isFinite(opts.totalCount)
      ? opts.totalCount
      : null;
  if (total != null && total > 0) {
    lines.push(
      items.length === total
        ? `**${items.length}** saved take${items.length === 1 ? '' : 's'}`
        : `**${items.length}** of **${total}** saved takes in this view`,
    );
    lines.push('');
  } else if (items.length > 0) {
    lines.push(`**${items.length}** saved take${items.length === 1 ? '' : 's'}`);
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
        ? '_No saved takes match this filter._'
        : '_No saved takes yet._',
    );
    lines.push('');
  } else {
    items.forEach((item, i) => {
      const agentName = (item.agentName || 'Arena mind').trim() || 'Arena mind';
      const prompt = (item.prompt || '').trim() || '(no prompt)';
      const oneLiner = (item.oneLiner || '').trim();
      const verdict = (item.verdict || '').trim();

      lines.push(`## ${i + 1}. ${agentName}`);
      lines.push('');
      lines.push(`**Question:** ${prompt}`);
      lines.push('');
      if (oneLiner) {
        lines.push(`> ${oneLiner}`);
        lines.push('');
      }
      if (verdict && verdict !== oneLiner) {
        lines.push(verdict);
        lines.push('');
      }
      const meta: string[] = [];
      if (typeof item.score === 'number' && Number.isFinite(item.score)) {
        meta.push(`Score ${Math.round(item.score)}`);
      }
      const when = formatIsoWhen(item.timestamp);
      if (when) meta.push(when);
      if (meta.length > 0) {
        lines.push(`_${meta.join(' · ')}_`);
        lines.push('');
      }
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena (saved takes)_');
  return lines.join('\n').trim() + '\n';
}


/**
 * JSON export of bookmarked takes (full list or current sidebar filter).
 */
export function formatSavedTakesJsonExport(opts: {
  items: SavedTakeListItem[];
  totalCount?: number | null;
  filterNote?: string | null;
  exportedAt?: string;
}): string {
  const items = (opts.items || []).map((item) => ({
    agentName: (item.agentName || 'Arena mind').trim() || 'Arena mind',
    prompt: (item.prompt || '').trim() || '(no prompt)',
    oneLiner: (item.oneLiner || '').trim() || null,
    verdict: (item.verdict || '').trim() || null,
    score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : null,
    timestamp: item.timestamp || null,
  }));
  return JSON.stringify(
    {
      exported_from: 'arena',
      exported_at: opts.exportedAt || new Date().toISOString(),
      total_saved:
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
