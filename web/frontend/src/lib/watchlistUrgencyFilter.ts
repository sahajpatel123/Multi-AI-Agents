/** Due-urgency filter for Agent Watchlist (overdue / due soon / later). */

export type WatchlistUrgencyFilter = 'all' | 'overdue' | 'due_soon' | 'later';

/** Default window for "due soon" (hours). */
export const WATCHLIST_DUE_SOON_HOURS = 24;

export const WATCHLIST_URGENCY_OPTIONS: Array<{
  value: WatchlistUrgencyFilter;
  label: string;
}> = [
  { value: 'all', label: 'All timing' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'later', label: 'Later' },
];

export function watchlistUrgencyLabel(filter: WatchlistUrgencyFilter): string {
  return WATCHLIST_URGENCY_OPTIONS.find((o) => o.value === filter)?.label || 'All timing';
}

export type WatchlistUrgencyItem = {
  isActive?: boolean;
  /** Snake-case from API. */
  is_active?: boolean;
  nextRunAt?: string | null;
  next_run_at?: string | null;
};

function resolveActive(item: WatchlistUrgencyItem): boolean {
  if (typeof item.isActive === 'boolean') return item.isActive;
  if (typeof item.is_active === 'boolean') return item.is_active;
  return true;
}

function resolveNextMs(item: WatchlistUrgencyItem): number | null {
  const iso = item.nextRunAt ?? item.next_run_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export type WatchlistUrgencyBucket = 'paused' | 'overdue' | 'due_soon' | 'later';

/**
 * Classify a watch by due urgency. Paused watches are their own bucket
 * (excluded from Overdue / Due soon / Later filters).
 */
export function watchlistUrgencyBucket(
  item: WatchlistUrgencyItem,
  nowMs: number = Date.now(),
  dueSoonHours: number = WATCHLIST_DUE_SOON_HOURS,
): WatchlistUrgencyBucket {
  if (!resolveActive(item)) return 'paused';
  const next = resolveNextMs(item);
  if (next == null) return 'later';
  if (next <= nowMs) return 'overdue';
  const soonEnd = nowMs + Math.max(0, dueSoonHours) * 60 * 60 * 1000;
  if (next <= soonEnd) return 'due_soon';
  return 'later';
}

/**
 * Filter watches by due urgency. Does not mutate the input.
 * Overdue / Due soon / Later only include active watches.
 */
export function filterWatchlistByUrgency<T extends WatchlistUrgencyItem>(
  items: T[],
  filter: WatchlistUrgencyFilter,
  nowMs: number = Date.now(),
  dueSoonHours: number = WATCHLIST_DUE_SOON_HOURS,
): T[] {
  const list = items || [];
  if (filter === 'all') return [...list];
  return list.filter(
    (item) => watchlistUrgencyBucket(item, nowMs, dueSoonHours) === filter,
  );
}

/**
 * True when chips are worth showing: at least one overdue or due-soon
 * active watch (otherwise "All timing" is enough).
 */
export function watchlistUrgencyFilterUseful(
  items: WatchlistUrgencyItem[],
  nowMs: number = Date.now(),
  dueSoonHours: number = WATCHLIST_DUE_SOON_HOURS,
): boolean {
  for (const item of items || []) {
    const b = watchlistUrgencyBucket(item, nowMs, dueSoonHours);
    if (b === 'overdue' || b === 'due_soon') return true;
  }
  return false;
}
