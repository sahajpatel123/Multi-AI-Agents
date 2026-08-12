/** Sort helpers for Arena sidebar resumable chats. */

export type SidebarChatsSort = 'newest' | 'oldest' | 'title' | 'turns';

export const SIDEBAR_CHATS_SORT_OPTIONS: Array<{
  value: SidebarChatsSort;
  label: string;
}> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'turns', label: 'Most turns' },
];

export function sidebarChatsSortLabel(sort: SidebarChatsSort): string {
  return SIDEBAR_CHATS_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Newest';
}

export type SidebarChatsSortable = {
  session_id: string;
  title?: string | null;
  last_prompt?: string | null;
  primary_topic?: string | null;
  turn_count?: number | null;
  last_active?: string | null;
  pinned?: boolean;
};

/** Return null when a chat has no parseable activity time. */
function createdMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Return the sortable title, or null when the chat has no title, prompt,
 * or topic. Missing titles sort after real titles instead of colliding
 * with a fake "zzz" sentinel.
 */
function displayTitle(item: SidebarChatsSortable): string | null {
  return (
    item.title ||
    item.last_prompt ||
    item.primary_topic ||
    ''
  ).trim() || null;
}

/** Unknown activity times sort after dated chats in either direction. */
function compareTimes(
  a: number | null,
  b: number | null,
  newestFirst: boolean,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return newestFirst ? b - a : a - b;
}

/**
 * Sort sidebar resumable chats. Pinned chats always float above the rest;
 * within each group the chosen ordering applies. Does not mutate the input.
 */
export function sortSidebarChats<T extends SidebarChatsSortable>(
  items: T[],
  sort: SidebarChatsSort,
): T[] {
  const list = [...(items || [])];
  const tie = (a: T, b: T) => cmpStr(a.session_id, b.session_id);

  list.sort((a, b) => {
    const pinDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDelta !== 0) return pinDelta;

    switch (sort) {
      case 'oldest': {
        const d = compareTimes(createdMs(a.last_active), createdMs(b.last_active), false);
        return d !== 0 ? d : tie(a, b);
      }
      case 'title': {
        const ta = displayTitle(a);
        const tb = displayTitle(b);
        if (ta === null && tb === null) return tie(a, b);
        if (ta === null) return 1;
        if (tb === null) return -1;
        const d = cmpStr(ta, tb);
        return d !== 0 ? d : tie(a, b);
      }
      case 'turns': {
        const ta =
          typeof a.turn_count === 'number' && Number.isFinite(a.turn_count)
            ? a.turn_count
            : Number.NEGATIVE_INFINITY;
        const tb =
          typeof b.turn_count === 'number' && Number.isFinite(b.turn_count)
            ? b.turn_count
            : Number.NEGATIVE_INFINITY;
        if (ta === Number.NEGATIVE_INFINITY && tb === Number.NEGATIVE_INFINITY) {
          return tie(a, b);
        }
        if (ta === Number.NEGATIVE_INFINITY) return 1;
        if (tb === Number.NEGATIVE_INFINITY) return -1;
        const d = tb - ta;
        return d !== 0 ? d : tie(a, b);
      }
      case 'newest':
      default: {
        const d = compareTimes(createdMs(a.last_active), createdMs(b.last_active), true);
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
