import { describe, expect, it } from 'vitest';
import {
  agentRoomsMembershipFilterUseful,
  agentRoomsMembershipLabel,
  filterAgentRoomsByMembership,
} from './agentRoomsMembershipFilter';

describe('agentRoomsMembershipFilter', () => {
  const rooms = [
    { id: 'a', memberCount: 1 },
    { id: 'b', memberCount: 4 },
    { id: 'c', memberCount: null },
  ];

  it('filters solo vs shared', () => {
    expect(filterAgentRoomsByMembership(rooms, 'all')).toHaveLength(3);
    expect(filterAgentRoomsByMembership(rooms, 'solo').map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterAgentRoomsByMembership(rooms, 'shared').map((r) => r.id)).toEqual(['b']);
  });

  it('detects when chips are useful', () => {
    expect(agentRoomsMembershipFilterUseful(rooms)).toBe(true);
    expect(agentRoomsMembershipFilterUseful([{ memberCount: 1 }, { memberCount: 1 }])).toBe(
      false,
    );
  });

  it('labels filters', () => {
    expect(agentRoomsMembershipLabel('shared')).toBe('Shared');
    expect(agentRoomsMembershipLabel('all')).toBe('All sizes');
  });
});
