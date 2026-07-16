/** Sort helpers for Arena sidebar Recents and Saved lists. */

export type SidebarRecentsSort = 'newest' | 'oldest' | 'title' | 'winner';

export const SIDEBAR_RECENTS_SORT_OPTIONS: Array<{ value: SidebarRecentsSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'Title' },
  { value: 'winner', label: 'Winner' },
];

export function sidebarRecentsSortLabel(sort: SidebarRecentsSort): string {
  return SIDEBAR_RECENTS_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Newest';
}

export type SidebarRecentsSortable = {
  turn_id: string;
  prompt: string;
  title?: string | null;
  winner_id: string;
  winnerName?: string | null;
  timestamp: string;
};

export type SidebarSavedSort =
  | 'newest'
  | 'oldest'
  | 'score_desc'
  | 'score_asc'
  | 'mind';

export const SIDEBAR_SAVED_SORT_OPTIONS: Array<{ value: SidebarSavedSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'score_desc', label: 'Score · high' },
  { value: 'score_asc', label: 'Score · low' },
  { value: 'mind', label: 'Mind' },
];

export function sidebarSavedSortLabel(sort: SidebarSavedSort): string {
  return SIDEBAR_SAVED_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Newest';
}

export type SidebarSavedSortable = {
  id: string | number;
  prompt?: string | null;
  mindName?: string | null;
  score?: number | null;
  timestamp?: string | null;
};

function createdMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function displayTitle(item: SidebarRecentsSortable): string {
  return (item.title || item.prompt || '').trim() || 'zzz';
}

/** Sort sidebar recents. Does not mutate the input. */
export function sortSidebarRecents<T extends SidebarRecentsSortable>(
  items: T[],
  sort: SidebarRecentsSort,
): T[] {
  const list = [...(items || [])];
  const tie = (a: T, b: T) => cmpStr(a.turn_id, b.turn_id);

  list.sort((a, b) => {
    switch (sort) {
      case 'oldest': {
        const d = createdMs(a.timestamp) - createdMs(b.timestamp);
        return d !== 0 ? d : tie(a, b);
      }
      case 'title': {
        const d = cmpStr(displayTitle(a), displayTitle(b));
        return d !== 0 ? d : tie(a, b);
      }
      case 'winner': {
        const d = cmpStr(
          (a.winnerName || a.winner_id || '').trim() || 'zzz',
          (b.winnerName || b.winner_id || '').trim() || 'zzz',
        );
        return d !== 0 ? d : tie(a, b);
      }
      case 'newest':
      default: {
        const d = createdMs(b.timestamp) - createdMs(a.timestamp);
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}

/** Sort sidebar saved takes. Does not mutate the input. */
export function sortSidebarSaved<T extends SidebarSavedSortable>(
  items: T[],
  sort: SidebarSavedSort,
): T[] {
  const list = [...(items || [])];
  const tie = (a: T, b: T) => cmpStr(String(a.id), String(b.id));

  list.sort((a, b) => {
    switch (sort) {
      case 'oldest': {
        const d = createdMs(a.timestamp) - createdMs(b.timestamp);
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_desc': {
        const sa =
          typeof a.score === 'number' && Number.isFinite(a.score)
            ? a.score
            : Number.NEGATIVE_INFINITY;
        const sb =
          typeof b.score === 'number' && Number.isFinite(b.score)
            ? b.score
            : Number.NEGATIVE_INFINITY;
        if (sa === Number.NEGATIVE_INFINITY && sb === Number.NEGATIVE_INFINITY) return tie(a, b);
        if (sa === Number.NEGATIVE_INFINITY) return 1;
        if (sb === Number.NEGATIVE_INFINITY) return -1;
        const d = sb - sa;
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_asc': {
        const sa =
          typeof a.score === 'number' && Number.isFinite(a.score)
            ? a.score
            : Number.POSITIVE_INFINITY;
        const sb =
          typeof b.score === 'number' && Number.isFinite(b.score)
            ? b.score
            : Number.POSITIVE_INFINITY;
        const d = sa - sb;
        return d !== 0 ? d : tie(a, b);
      }
      case 'mind': {
        const d = cmpStr((a.mindName || '').trim() || 'zzz', (b.mindName || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
      case 'newest':
      default: {
        const d = createdMs(b.timestamp) - createdMs(a.timestamp);
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
