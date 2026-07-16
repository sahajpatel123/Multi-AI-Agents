/** Cadence filter for Agent Watchlist (daily / 3-day / weekly). */

import {
  WATCHLIST_INTERVALS,
  type WatchlistIntervalHours,
} from './watchlistIntervals';

export type WatchlistCadenceFilter = 'all' | WatchlistIntervalHours;

export const WATCHLIST_CADENCE_OPTIONS: Array<{
  value: WatchlistCadenceFilter;
  label: string;
}> = [
  { value: 'all', label: 'All cadences' },
  ...WATCHLIST_INTERVALS.map((opt) => ({
    value: opt.hours as WatchlistCadenceFilter,
    label: opt.short,
  })),
];

export function watchlistCadenceLabel(filter: WatchlistCadenceFilter): string {
  return WATCHLIST_CADENCE_OPTIONS.find((o) => o.value === filter)?.label || 'All cadences';
}

export type WatchlistCadenceItem = {
  intervalHours?: number | null;
  /** Snake-case shape from API. */
  interval_hours?: number | null;
};

function resolveHours(item: WatchlistCadenceItem): number | null {
  if (typeof item.intervalHours === 'number' && Number.isFinite(item.intervalHours)) {
    return item.intervalHours;
  }
  if (typeof item.interval_hours === 'number' && Number.isFinite(item.interval_hours)) {
    return item.interval_hours;
  }
  return null;
}

/**
 * Filter watches by re-check cadence. Does not mutate the input.
 */
export function filterWatchlistByCadence<T extends WatchlistCadenceItem>(
  items: T[],
  filter: WatchlistCadenceFilter,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter((item) => resolveHours(item) === filter);
}

/** True when more than one cadence appears in the list (chips worth showing). */
export function watchlistCadenceFilterUseful(items: WatchlistCadenceItem[]): boolean {
  const seen = new Set<number>();
  for (const item of items || []) {
    const h = resolveHours(item);
    if (h == null) continue;
    seen.add(h);
    if (seen.size > 1) return true;
  }
  return false;
}
