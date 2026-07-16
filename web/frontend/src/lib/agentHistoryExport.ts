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
};

function displayTitle(item: AgentHistoryExportItem): string {
  const title = (item.title || '').trim();
  if (title) return title;
  const q = (item.question || '').trim();
  if (q) return q.length > 120 ? `${q.slice(0, 119).trimEnd()}…` : q;
  return 'Untitled research';
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
    lines.push(`_Filtered view: ${filterNote}_`);
    lines.push('');
  }

  if (items.length === 0) {
    lines.push('_No research tasks in this view._');
  } else {
    items.forEach((item, i) => {
      const title = displayTitle(item);
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');
      const q = (item.question || '').trim();
      if (q && q !== title) {
        lines.push(`**Question:** ${q}`);
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
        lines.push(`- **Topics:** ${topics.join(', ')}`);
      }
      const taskId = (item.taskId || '').trim();
      if (taskId) {
        lines.push(`- _Task \`${taskId}\`_`);
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena Agent history_');
  return lines.join('\n').trim() + '\n';
}
