/**
 * Pure helpers for the watchlist overview statistics strip.
 */

export type WatchlistStatisticsLike = {
  total_items?: number | null;
  active_items?: number | null;
  total_runs?: number | null;
  scored_runs?: number | null;
  avg_score?: number | null;
  min_score?: number | null;
  max_score?: number | null;
  success_rate?: number | null;
};

export type WatchlistStatTile = {
  key: string;
  label: string;
  value: string;
};

function statValue(value: number | null | undefined, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)}${suffix}`
    : '—';
}

/** Compact metric tiles for the watchlist overview strip. */
export function watchlistStatTiles(
  stats: WatchlistStatisticsLike | null | undefined,
): WatchlistStatTile[] {
  if (!stats) return [];
  const total = typeof stats.total_items === 'number' ? stats.total_items : 0;
  const active = typeof stats.active_items === 'number' ? stats.active_items : 0;
  const min = stats.min_score;
  const max = stats.max_score;
  const scoreRange =
    typeof min === 'number' &&
    Number.isFinite(min) &&
    typeof max === 'number' &&
    Number.isFinite(max)
      ? min === max
        ? `${Math.round(min)}`
        : `${Math.round(min)}–${Math.round(max)}`
      : '—';
  return [
    { key: 'active', label: 'Active watches', value: `${active}/${total}` },
    { key: 'runs', label: 'Research runs', value: statValue(stats.total_runs) },
    { key: 'scored', label: 'Scored runs', value: statValue(stats.scored_runs) },
    { key: 'avg', label: 'Average score', value: statValue(stats.avg_score) },
    { key: 'range', label: 'Score range', value: scoreRange },
    { key: 'success', label: 'Scored rate', value: statValue(stats.success_rate, '%') },
  ];
}
