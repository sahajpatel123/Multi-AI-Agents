/** Sort helpers for the collaborative Room research board. */

export type RoomBoardSort =
  | 'newest'
  | 'oldest'
  | 'score_desc'
  | 'score_asc'
  | 'author'
  | 'title';

export const ROOM_BOARD_SORT_OPTIONS: Array<{ value: RoomBoardSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'score_desc', label: 'Score · high' },
  { value: 'score_asc', label: 'Score · low' },
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
];

export function roomBoardSortLabel(sort: RoomBoardSort): string {
  return ROOM_BOARD_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Newest';
}

export type RoomBoardSortableTask = {
  title?: string | null;
  author?: string | null;
  score?: number | null;
  createdAt?: string | null;
  /** Stable tie-breaker (task id). */
  id?: string | null;
};

function createdMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function scoreValue(score: number | null | undefined): number {
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  // Missing scores sink to the bottom for high→low, top for low→high via separate path.
  return Number.NEGATIVE_INFINITY;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Sort board tasks for display / export. Does not mutate the input array.
 */
export function sortRoomBoardTasks<T extends RoomBoardSortableTask>(
  tasks: T[],
  sort: RoomBoardSort,
): T[] {
  const items = [...(tasks || [])];
  const tie = (a: T, b: T) => cmpStr(String(a.id || ''), String(b.id || ''));

  items.sort((a, b) => {
    switch (sort) {
      case 'oldest': {
        const d = createdMs(a.createdAt) - createdMs(b.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
      case 'score_desc': {
        const sa = scoreValue(a.score);
        const sb = scoreValue(b.score);
        // Missing scores last
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
      case 'author': {
        const d = cmpStr((a.author || '').trim() || 'zzz', (b.author || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
      case 'title': {
        const d = cmpStr((a.title || '').trim() || 'zzz', (b.title || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
      case 'newest':
      default: {
        const d = createdMs(b.createdAt) - createdMs(a.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return items;
}
