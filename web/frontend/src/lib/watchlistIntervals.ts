/** Allowed re-check cadences — matches Agent create picker + backend PATCH validation. */
export const WATCHLIST_INTERVALS = [
  { hours: 24 as const, label: '24h', short: 'Daily' },
  { hours: 72 as const, label: '3d', short: 'Every 3 days' },
  { hours: 168 as const, label: '7d', short: 'Weekly' },
] as const;

export type WatchlistIntervalHours = (typeof WATCHLIST_INTERVALS)[number]['hours'];

export function isWatchlistInterval(hours: number): hours is WatchlistIntervalHours {
  return WATCHLIST_INTERVALS.some((opt) => opt.hours === hours);
}
