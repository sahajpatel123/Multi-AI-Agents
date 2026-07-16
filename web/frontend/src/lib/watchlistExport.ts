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
