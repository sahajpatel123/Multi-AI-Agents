import { describe, expect, it } from 'vitest';
import { agentRoomsSortLabel, sortAgentRooms } from './agentRoomsSort';

const sample = [
  {
    id: 'a',
    name: 'Zebra lab',
    memberCount: 2,
    taskCount: 9,
    createdAt: '2026-01-01T00:00:00Z',
    activityAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'b',
    name: 'Alpha board',
    memberCount: 5,
    taskCount: 3,
    createdAt: '2026-05-01T00:00:00Z',
    activityAt: '2026-05-15T00:00:00Z',
  },
  {
    id: 'c',
    name: 'Middle room',
    memberCount: 1,
    taskCount: 12,
    createdAt: '2026-03-01T00:00:00Z',
    activityAt: null,
  },
];

describe('sortAgentRooms', () => {
  it('sorts by recent activity (synthesis then created)', () => {
    expect(sortAgentRooms(sample, 'recent').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by newest created', () => {
    expect(sortAgentRooms(sample, 'newest').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by name', () => {
    expect(sortAgentRooms(sample, 'name').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by most members', () => {
    expect(sortAgentRooms(sample, 'members').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by most tasks', () => {
    expect(sortAgentRooms(sample, 'tasks').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    sortAgentRooms(sample, 'name');
    expect(sample).toEqual(copy);
  });
});

describe('agentRoomsSortLabel', () => {
  it('returns labels', () => {
    expect(agentRoomsSortLabel('recent')).toBe('Recent activity');
    expect(agentRoomsSortLabel('members')).toBe('Most members');
  });
});
