/** Membership-size filter for Agent sidebar Rooms (solo vs shared). */

export type AgentRoomsMembershipFilter = 'all' | 'solo' | 'shared';

export const AGENT_ROOMS_MEMBERSHIP_OPTIONS: Array<{
  value: AgentRoomsMembershipFilter;
  label: string;
}> = [
  { value: 'all', label: 'All sizes' },
  { value: 'solo', label: 'Solo' },
  { value: 'shared', label: 'Shared' },
];

export function agentRoomsMembershipLabel(filter: AgentRoomsMembershipFilter): string {
  return AGENT_ROOMS_MEMBERSHIP_OPTIONS.find((o) => o.value === filter)?.label || 'All sizes';
}

export type AgentRoomMembershipItem = {
  memberCount?: number | null;
};

function members(room: AgentRoomMembershipItem): number {
  const n = room.memberCount;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) return Math.floor(n);
  // Missing counts treat as solo (single owner) rather than inventing a shared room.
  return 1;
}

/**
 * Filter rooms by solo (1) vs shared (2+). Does not mutate the input.
 */
export function filterAgentRoomsByMembership<T extends AgentRoomMembershipItem>(
  rooms: T[],
  filter: AgentRoomsMembershipFilter,
): T[] {
  const list = rooms || [];
  if (filter === 'all') return [...list];
  if (filter === 'solo') return list.filter((r) => members(r) <= 1);
  return list.filter((r) => members(r) >= 2);
}

/** True when both solo and shared rooms exist. */
export function agentRoomsMembershipFilterUseful(
  rooms: AgentRoomMembershipItem[],
): boolean {
  const list = rooms || [];
  if (list.length < 2) return false;
  let solo = false;
  let shared = false;
  for (const r of list) {
    if (members(r) <= 1) solo = true;
    else shared = true;
    if (solo && shared) return true;
  }
  return false;
}
