/** "Pinned only" filter for saved takes in the sidebar. */

export type SavedPinFilterValue = 'all' | 'pinned';

export const SIDEBAR_SAVED_PIN_ALL = 'all';
export const SIDEBAR_SAVED_PIN_ONLY = 'pinned';

export type SavedPinFilterable = {
  pinned?: boolean;
};

export function filterSavedByPin<T extends SavedPinFilterable>(
  items: T[],
  filter: SavedPinFilterValue,
): T[] {
  const list = Array.isArray(items) ? items : [];
  if (filter === SIDEBAR_SAVED_PIN_ONLY) {
    return list.filter((item) => item.pinned === true);
  }
  return list;
}

export function savedPinFilterLabel(filter: SavedPinFilterValue): string {
  return filter === SIDEBAR_SAVED_PIN_ONLY ? 'pinned' : 'all';
}
