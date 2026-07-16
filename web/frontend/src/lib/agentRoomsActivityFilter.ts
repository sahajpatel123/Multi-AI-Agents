/** Activity filter for Agent sidebar Rooms list (new synthesis vs up to date). */

export type AgentRoomsActivityFilter = 'all' | 'needs_attention' | 'caught_up';

export const AGENT_ROOMS_ACTIVITY_OPTIONS: Array<{
  value: AgentRoomsActivityFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'needs_attention', label: 'New synthesis' },
  { value: 'caught_up', label: 'Caught up' },
];

export function agentRoomsActivityLabel(filter: AgentRoomsActivityFilter): string {
  return AGENT_ROOMS_ACTIVITY_OPTIONS.find((o) => o.value === filter)?.label || 'All';
}

export type AgentRoomActivityItem = {
  synthesisUpdatedAt?: string | null;
  lastSeenAt?: string | null;
};

/**
 * True when synthesis is newer than the user’s last visit.
 * Missing timestamps are treated as not needing attention (no false dots).
 */
export function roomNeedsAttention(room: AgentRoomActivityItem): boolean {
  const synth = (room.synthesisUpdatedAt || '').trim();
  const seen = (room.lastSeenAt || '').trim();
  if (!synth || !seen) return false;
  const s = new Date(synth).getTime();
  const v = new Date(seen).getTime();
  if (Number.isNaN(s) || Number.isNaN(v)) return false;
  return s > v;
}

/**
 * Filter rooms by synthesis attention state. Does not mutate the input.
 */
export function filterAgentRoomsByActivity<T extends AgentRoomActivityItem>(
  rooms: T[],
  filter: AgentRoomsActivityFilter,
): T[] {
  const list = rooms || [];
  if (filter === 'all') return [...list];
  if (filter === 'needs_attention') return list.filter((r) => roomNeedsAttention(r));
  return list.filter((r) => !roomNeedsAttention(r));
}
