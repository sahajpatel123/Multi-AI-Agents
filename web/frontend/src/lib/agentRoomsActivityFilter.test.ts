import { describe, expect, it } from 'vitest';
import {
  agentRoomsActivityLabel,
  filterAgentRoomsByActivity,
  roomNeedsAttention,
} from './agentRoomsActivityFilter';

describe('roomNeedsAttention', () => {
  it('is true when synthesis is after last seen', () => {
    expect(
      roomNeedsAttention({
        synthesisUpdatedAt: '2026-07-02T00:00:00Z',
        lastSeenAt: '2026-07-01T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('is false when caught up or timestamps missing', () => {
    expect(
      roomNeedsAttention({
        synthesisUpdatedAt: '2026-07-01T00:00:00Z',
        lastSeenAt: '2026-07-02T00:00:00Z',
      }),
    ).toBe(false);
    expect(roomNeedsAttention({ synthesisUpdatedAt: '2026-07-02T00:00:00Z' })).toBe(false);
    expect(roomNeedsAttention({})).toBe(false);
  });
});

describe('filterAgentRoomsByActivity', () => {
  const sample = [
    {
      id: 'a',
      synthesisUpdatedAt: '2026-07-03T00:00:00Z',
      lastSeenAt: '2026-07-01T00:00:00Z',
    },
    {
      id: 'b',
      synthesisUpdatedAt: '2026-07-01T00:00:00Z',
      lastSeenAt: '2026-07-02T00:00:00Z',
    },
    { id: 'c', synthesisUpdatedAt: null, lastSeenAt: '2026-07-01T00:00:00Z' },
  ];

  it('filters needs attention and caught up', () => {
    expect(filterAgentRoomsByActivity(sample, 'needs_attention').map((r) => r.id)).toEqual([
      'a',
    ]);
    expect(filterAgentRoomsByActivity(sample, 'caught_up').map((r) => r.id)).toEqual([
      'b',
      'c',
    ]);
    expect(filterAgentRoomsByActivity(sample, 'all')).toHaveLength(3);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    filterAgentRoomsByActivity(sample, 'needs_attention');
    expect(sample).toEqual(copy);
  });
});

describe('agentRoomsActivityLabel', () => {
  it('returns labels', () => {
    expect(agentRoomsActivityLabel('needs_attention')).toBe('New synthesis');
    expect(agentRoomsActivityLabel('caught_up')).toBe('Caught up');
  });
});
