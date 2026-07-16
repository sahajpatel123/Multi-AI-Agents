/** Expertise-level filter for Agent Watchlist. */

export const WATCHLIST_EXPERTISE_ALL = 'all' as const;

export type WatchlistExpertiseFilter = typeof WATCHLIST_EXPERTISE_ALL | string;

export type WatchlistExpertiseOption = {
  value: WatchlistExpertiseFilter;
  label: string;
};

export type WatchlistExpertiseItem = {
  expertise_level?: string | null;
};

const EXPERTISE_LABELS: Record<string, string> = {
  curious: 'Curious',
  practitioner: 'Practitioner',
  researcher: 'Researcher',
  expert: 'Expert',
};

function resolveExpertiseKey(item: WatchlistExpertiseItem): string {
  const raw = (item.expertise_level || '').trim().toLowerCase();
  return raw || 'unknown';
}

function labelForExpertise(key: string): string {
  if (EXPERTISE_LABELS[key]) return EXPERTISE_LABELS[key];
  if (!key || key === 'unknown') return 'Unspecified';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Build All levels + unique expertise chips from watchlist items.
 */
export function collectWatchlistExpertiseOptions(
  items: WatchlistExpertiseItem[],
): WatchlistExpertiseOption[] {
  const keys = new Set<string>();
  for (const item of items || []) {
    keys.add(resolveExpertiseKey(item));
  }
  const levels = [...keys]
    .map((value) => ({ value, label: labelForExpertise(value) }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }),
    );
  return [{ value: WATCHLIST_EXPERTISE_ALL, label: 'All levels' }, ...levels];
}

export function watchlistExpertiseLabel(
  filter: WatchlistExpertiseFilter,
  options: WatchlistExpertiseOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All levels';
}

/**
 * Filter watches by expertise level. Does not mutate the input.
 */
export function filterWatchlistByExpertise<T extends WatchlistExpertiseItem>(
  items: T[],
  filter: WatchlistExpertiseFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === WATCHLIST_EXPERTISE_ALL) return [...list];
  return list.filter((item) => resolveExpertiseKey(item) === filter);
}

/** True when more than one expertise level is present. */
export function watchlistExpertiseFilterUseful(items: WatchlistExpertiseItem[]): boolean {
  const keys = new Set<string>();
  for (const item of items || []) {
    keys.add(resolveExpertiseKey(item));
    if (keys.size > 1) return true;
  }
  return false;
}
