/** Sort helpers for Agent sidebar Rooms list. */

export type AgentRoomsSort =
  | 'recent'
  | 'newest'
  | 'name'
  | 'members'
  | 'tasks';

export const AGENT_ROOMS_SORT_OPTIONS: Array<{ value: AgentRoomsSort; label: string }> = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'members', label: 'Most members' },
  { value: 'tasks', label: 'Most tasks' },
];

export function agentRoomsSortLabel(sort: AgentRoomsSort): string {
  return AGENT_ROOMS_SORT_OPTIONS.find((o) => o.value === sort)?.label || 'Recent activity';
}

export type AgentRoomSortable = {
  id?: string | null;
  name?: string | null;
  memberCount?: number | null;
  taskCount?: number | null;
  createdAt?: string | null;
  /** Last synthesis / activity timestamp. */
  activityAt?: string | null;
};

function timeMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function cmpStr(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Sort rooms for display. Does not mutate the input.
 */
export function sortAgentRooms<T extends AgentRoomSortable>(
  rooms: T[],
  sort: AgentRoomsSort,
): T[] {
  const list = [...(rooms || [])];
  const tie = (a: T, b: T) => cmpStr(String(a.id || a.name || ''), String(b.id || b.name || ''));

  list.sort((a, b) => {
    switch (sort) {
      case 'newest': {
        const d = timeMs(b.createdAt) - timeMs(a.createdAt);
        return d !== 0 ? d : tie(a, b);
      }
      case 'name': {
        const d = cmpStr((a.name || '').trim() || 'zzz', (b.name || '').trim() || 'zzz');
        return d !== 0 ? d : tie(a, b);
      }
      case 'members': {
        const ma =
          typeof a.memberCount === 'number' && Number.isFinite(a.memberCount) ? a.memberCount : 0;
        const mb =
          typeof b.memberCount === 'number' && Number.isFinite(b.memberCount) ? b.memberCount : 0;
        const d = mb - ma;
        return d !== 0 ? d : tie(a, b);
      }
      case 'tasks': {
        const ta =
          typeof a.taskCount === 'number' && Number.isFinite(a.taskCount) ? a.taskCount : 0;
        const tb =
          typeof b.taskCount === 'number' && Number.isFinite(b.taskCount) ? b.taskCount : 0;
        const d = tb - ta;
        return d !== 0 ? d : tie(a, b);
      }
      case 'recent':
      default: {
        // Prefer synthesis activity, fall back to created_at.
        const ta = timeMs(a.activityAt) || timeMs(a.createdAt);
        const tb = timeMs(b.activityAt) || timeMs(b.createdAt);
        const d = tb - ta;
        return d !== 0 ? d : tie(a, b);
      }
    }
  });

  return list;
}
