/** "Pinned only" filter for resumable chats in the sidebar. */

export type SidebarChatsPinFilter = 'all' | 'pinned';

export const SIDEBAR_CHATS_PIN_ALL: SidebarChatsPinFilter = 'all';
export const SIDEBAR_CHATS_PIN_ONLY: SidebarChatsPinFilter = 'pinned';

export const SIDEBAR_CHATS_PIN_FILTER_OPTIONS: Array<{
  value: SidebarChatsPinFilter;
  label: string;
}> = [
  { value: SIDEBAR_CHATS_PIN_ALL, label: 'All chats' },
  { value: SIDEBAR_CHATS_PIN_ONLY, label: 'Pinned only' },
];

export type SidebarChatsPinFilterable = {
  pinned?: boolean;
};

/**
 * Filter sidebar resumable chats by pin state. The `all` filter returns the
 * list unchanged; `pinned` keeps only chats explicitly pinned to the top.
 * Returns a new array so callers can safely chain sort/search transforms.
 */
export function filterChatsByPin<T extends SidebarChatsPinFilterable>(
  items: readonly T[] | T[],
  filter: SidebarChatsPinFilter,
): T[] {
  const list = Array.isArray(items) ? [...items] : [];
  if (filter === SIDEBAR_CHATS_PIN_ONLY) {
    return list.filter((item) => item.pinned === true);
  }
  return list;
}

export function sidebarChatsPinFilterLabel(filter: SidebarChatsPinFilter): string {
  return (
    SIDEBAR_CHATS_PIN_FILTER_OPTIONS.find((option) => option.value === filter)?.label ||
    'All chats'
  );
}
