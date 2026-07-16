/** Occupancy filter for Agent sidebar Rooms (has tasks vs empty). */

export type AgentRoomsOccupancyFilter = 'all' | 'with_tasks' | 'empty';

export const AGENT_ROOMS_OCCUPANCY_OPTIONS: Array<{
  value: AgentRoomsOccupancyFilter;
  label: string;
}> = [
  { value: 'all', label: 'All rooms' },
  { value: 'with_tasks', label: 'With tasks' },
  { value: 'empty', label: 'Empty' },
];

export function agentRoomsOccupancyLabel(filter: AgentRoomsOccupancyFilter): string {
  return AGENT_ROOMS_OCCUPANCY_OPTIONS.find((o) => o.value === filter)?.label || 'All rooms';
}

export type AgentRoomOccupancyItem = {
  taskCount?: number | null;
};

function taskCount(room: AgentRoomOccupancyItem): number {
  const n = room.taskCount;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Filter rooms by whether they have research tasks. Does not mutate the input.
 */
export function filterAgentRoomsByOccupancy<T extends AgentRoomOccupancyItem>(
  rooms: T[],
  filter: AgentRoomsOccupancyFilter,
): T[] {
  const list = rooms || [];
  if (filter === 'all') return [...list];
  if (filter === 'with_tasks') return list.filter((r) => taskCount(r) > 0);
  return list.filter((r) => taskCount(r) === 0);
}

/** True when both empty and non-empty rooms exist. */
export function agentRoomsOccupancyFilterUseful(
  rooms: AgentRoomOccupancyItem[],
): boolean {
  const list = rooms || [];
  if (list.length < 2) return false;
  let hasTasks = false;
  let empty = false;
  for (const r of list) {
    if (taskCount(r) > 0) hasTasks = true;
    else empty = true;
    if (hasTasks && empty) return true;
  }
  return false;
}
