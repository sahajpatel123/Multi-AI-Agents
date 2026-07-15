/** Pure UI mode for Watchlist main body — load failure ≠ empty list. */

export type WatchlistBodyMode = 'loading' | 'load_error' | 'empty' | 'list';

export function watchlistBodyMode(opts: {
  loading: boolean;
  loadFailed: boolean;
  itemCount: number;
}): WatchlistBodyMode {
  if (opts.loading) return 'loading';
  if (opts.loadFailed) return 'load_error';
  if (opts.itemCount <= 0) return 'empty';
  return 'list';
}
