/**
 * Pure helpers for Agent Watchlist per-item run history.
 */

export type WatchlistHistoryStatsLike = {
  count?: number | null;
  scored_count?: number | null;
  avg_score?: number | null;
  min_score?: number | null;
  max_score?: number | null;
};

export type WatchlistHistoryRunLike = {
  task_id?: string | null;
  title?: string | null;
  final_score?: number | null;
  user_feedback?: string | null;
  created_at?: string | null;
};

export type WatchlistScoreTrend = {
  /** Latest scored run minus the prior scored run (items newest-first). */
  delta: number;
  latest: number;
  previous: number;
  /** e.g. "↑ 10 vs prior" / "↓ 5 vs prior" / "unchanged vs prior" */
  label: string;
};

/** Human summary, e.g. "3 runs · avg 70 · 60–80". Empty when no runs. */
export function formatWatchlistHistoryStats(stats: WatchlistHistoryStatsLike | null | undefined): string {
  if (!stats) return '';
  const count = typeof stats.count === 'number' ? stats.count : 0;
  if (count <= 0) return 'No runs yet';
  const scored = typeof stats.scored_count === 'number' ? stats.scored_count : 0;
  const bits: string[] = [`${count} run${count === 1 ? '' : 's'}`];
  if (scored > 0 && scored < count) {
    bits.push(`${scored} scored`);
  }
  if (typeof stats.avg_score === 'number' && Number.isFinite(stats.avg_score)) {
    bits.push(`avg ${Math.round(stats.avg_score)}`);
  }
  if (
    typeof stats.min_score === 'number' &&
    typeof stats.max_score === 'number' &&
    Number.isFinite(stats.min_score) &&
    Number.isFinite(stats.max_score)
  ) {
    if (stats.min_score === stats.max_score) {
      bits.push(`${stats.min_score}`);
    } else {
      bits.push(`${stats.min_score}–${stats.max_score}`);
    }
  }
  return bits.join(' · ');
}

/**
 * Score change between the two most recent *scored* runs (newest first).
 * Returns null when fewer than two scored runs exist.
 */
export function watchlistScoreTrend(
  items: Array<{ final_score?: number | null }> | null | undefined,
): WatchlistScoreTrend | null {
  const scored: number[] = [];
  for (const item of items || []) {
    const s = item?.final_score;
    if (typeof s === 'number' && Number.isFinite(s)) scored.push(s);
    if (scored.length >= 2) break;
  }
  if (scored.length < 2) return null;
  const latest = scored[0];
  const previous = scored[1];
  const delta = latest - previous;
  const abs = Math.abs(Math.round(delta));
  let label: string;
  if (delta > 0) label = `↑ ${abs} vs prior`;
  else if (delta < 0) label = `↓ ${abs} vs prior`;
  else label = 'unchanged vs prior';
  return { delta, latest, previous, label };
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/** Portable markdown for one watch’s run history (export / copy). */
export function formatWatchlistHistoryExport(opts: {
  question: string;
  stats?: WatchlistHistoryStatsLike | null;
  items: WatchlistHistoryRunLike[];
  trend?: WatchlistScoreTrend | null;
}): string {
  const question = (opts.question || '').trim() || '(untitled watch)';
  const lines: string[] = [
    '# Watchlist run history',
    '',
    `**Question:** ${question}`,
    '',
  ];
  const statsLabel = formatWatchlistHistoryStats(opts.stats);
  if (statsLabel) {
    lines.push(`**Summary:** ${statsLabel}`);
    lines.push('');
  }
  if (opts.trend) {
    lines.push(`**Trend:** ${opts.trend.label} (latest ${opts.trend.latest} · prior ${opts.trend.previous})`);
    lines.push('');
  }
  const items = opts.items || [];
  if (items.length === 0) {
    lines.push('_No runs recorded._');
  } else {
    items.forEach((run, i) => {
      const title = (run.title || '').trim() || 'Research run';
      const score =
        typeof run.final_score === 'number' && Number.isFinite(run.final_score)
          ? `${run.final_score}/100`
          : '—';
      lines.push(`## ${i + 1}. ${title}`);
      lines.push('');
      lines.push(`- **Score:** ${score}`);
      lines.push(`- **When:** ${formatWhen(run.created_at)}`);
      if (run.task_id) lines.push(`- **Task:** \`${run.task_id}\``);
      const fb = (run.user_feedback || '').trim();
      if (fb) lines.push(`- **Feedback:** ${fb}`);
      lines.push('');
    });
  }
  lines.push('---');
  lines.push('_Exported from Arena Agent Watchlist_');
  return lines.join('\n').trim() + '\n';
}
