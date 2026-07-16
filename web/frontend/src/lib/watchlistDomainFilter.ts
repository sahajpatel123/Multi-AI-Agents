/** Expertise-domain filter for Agent Watchlist. */

export const WATCHLIST_DOMAIN_ALL = 'all' as const;

export type WatchlistDomainFilter = typeof WATCHLIST_DOMAIN_ALL | string;

export type WatchlistDomainOption = {
  value: WatchlistDomainFilter;
  label: string;
};

export type WatchlistDomainItem = {
  expertise_domain?: string | null;
};

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function displayDomain(domain: string): string {
  const t = domain.trim();
  if (!t) return 'Unspecified';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Build All domains + unique domain chips from watchlist items.
 * Caps at the most common domains when there are many.
 */
export function collectWatchlistDomainOptions(
  items: WatchlistDomainItem[],
  maxDomains = 8,
): WatchlistDomainOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const item of items || []) {
    const raw = (item.expertise_domain || '').trim();
    const key = normalizeDomain(raw);
    if (!key) continue;
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { label: displayDomain(raw), count: 1 });
    }
  }

  const domains = [...counts.entries()]
    .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true });
    })
    .slice(0, Math.max(1, maxDomains))
    .map(({ value, label }) => ({ value, label }));

  return [{ value: WATCHLIST_DOMAIN_ALL, label: 'All domains' }, ...domains];
}

export function watchlistDomainLabel(
  filter: WatchlistDomainFilter,
  options: WatchlistDomainOption[],
): string {
  return options.find((o) => o.value === filter)?.label || 'All domains';
}

/**
 * Filter watches by expertise domain. Does not mutate the input.
 */
export function filterWatchlistByDomain<T extends WatchlistDomainItem>(
  items: T[],
  filter: WatchlistDomainFilter,
): T[] {
  const list = items || [];
  if (!filter || filter === WATCHLIST_DOMAIN_ALL) return [...list];
  return list.filter((item) => normalizeDomain(item.expertise_domain || '') === filter);
}

/** True when more than one expertise domain is present. */
export function watchlistDomainFilterUseful(items: WatchlistDomainItem[]): boolean {
  return collectWatchlistDomainOptions(items, 3).length > 2;
}
