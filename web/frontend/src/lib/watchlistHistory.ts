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
