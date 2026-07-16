/** Portable markdown for Arena sidebar recents (filtered session turns). */

export type ArenaRecentExportItem = {
  title?: string | null;
  prompt?: string | null;
  category?: string | null;
  winnerName?: string | null;
  timestamp?: string | null;
  turnId?: string | null;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

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
      const when = formatWhen(item.timestamp);
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
