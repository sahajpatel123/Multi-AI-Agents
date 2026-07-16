/** Sort helpers for Agent Watchlist list views. */

export type WatchlistSort =
  | 'next_soon'
  | 'next_late'
  | 'last_run'
  | 'score_desc'
  | 'runs'
  | 'question';

export const WATCHLIST_SORT_OPTIONS: Array<{ value: WatchlistSort; label: string }> = [
  { value: 'next_soon', label: 'Next run · soon' },
  { value: 'next_late', label: 'Next run · later' },
  { value: 'last_run', label: 'Last run' },
  { value: 'score_desc', label: 'Score · high' },
  { value: 'runs', label: 'Most runs' },
  { value: 'question', label: 'Question A–Z' },
];

export function watchlistSortLabel(sort: WatchlistSort): string {
  return WATCHLIST_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Next run · soon';
}

export type WatchlistSortableItem = {
  id?: string | null;
  question?: string | null;
  isActive?: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  runCount?: number | null;
  latestScore?: number | null;
};

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Sort watchlist items for display / export. Does not mutate the input.
 * Paused items sink after active ones when sorting by next-run.
 */
export function sortWatchlistItems<T extends WatchlistSortableItem>(
  items: T[],
  sort: WatchlistSort,
): T[] {
  const list = [...(items || [])];
  const tie = (a: T, b: T) => cmpStr(String(a.id || ''), String(b.id || ''));

  list.sort((a, b) => {
    switch (sort) {
      case 'next_late': {
        // Active first by next-run descending; paused last.
        const aActive = a.isActive !== false;
        const bActive = b.isActive !== false;
        if (aActive !== bActive) return aActive ? -1 : 1;
        const ta = timeMs(a.nextRunAt) ?? 0;
        const tb = timeMs(b.nextRunAt) ?? 0;
        const d = tb - ta;
        return d !== 0 ? d : tie(a, b);
      }
      case 'last_run': {
        const ta = timeMs(a.lastRunAt) ?? 0;
        const tb = timeMs(b.lastRunAt) ?? 0;
        const d = tb - ta;
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_desc': {
        const sa =
          typeof a.latestScore === 'number' && Number.isFinite(a.latestScore)
            ? a.latestScore
            : Number.NEGATIVE_INFINITY;
        const sb =
          typeof b.latestScore === 'number' && Number.isFinite(b.latestScore)
            ? b.latestScore
            : Number.NEGATIVE_INFINITY;
        if (sa === Number.NEGATIVE_INFINITY && sb === Number.NEGATIVE_INFINITY) return tie(a, b);
        if (sa === Number.NEGATIVE_INFINITY) return 1;
        if (sb === Number.NEGATIVE_INFINITY) return -1;
        const d = sb - sa;
        return d !== 0 ? d : tie(a, b);
      }
      case 'runs': {
        const ra = typeof a.runCount === 'number' && Number.isFinite(a.runCount) ? a.runCount : 0;
        const rb = typeof b.runCount === 'number' && Number.isFinite(b.runCount) ? b.runCount : 0;
        const d = rb - ra;
        return d !== 0 ? d : tie(a, b);
      }
      case 'question': {
        const d = cmpStr((a.question || '').trim() || 'zzz', (b.question || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
      case 'next_soon':
      default: {
        const aActive = a.isActive !== false;
        const bActive = b.isActive !== false;
        if (aActive !== bActive) return aActive ? -1 : 1;
        const ta = timeMs(a.nextRunAt) ?? Number.POSITIVE_INFINITY;
        const tb = timeMs(b.nextRunAt) ?? Number.POSITIVE_INFINITY;
        const d = ta - tb;
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
