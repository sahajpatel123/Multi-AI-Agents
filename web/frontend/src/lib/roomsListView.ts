/** Pure UI mode for the Agent sidebar Rooms list — load failure ≠ empty. */

export type RoomsListBodyMode = 'loading' | 'load_error' | 'empty' | 'list';

export function roomsListBodyMode(opts: {
  loading: boolean;
  loadFailed: boolean;
  itemCount: number;
}): RoomsListBodyMode {
  if (opts.loading) return 'loading';
  if (opts.loadFailed) return 'load_error';
  if (opts.itemCount <= 0) return 'empty';
  return 'list';
}
