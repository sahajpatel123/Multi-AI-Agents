import { describe, expect, it } from 'vitest';
import {
  agentRoomsOccupancyFilterUseful,
  agentRoomsOccupancyLabel,
  filterAgentRoomsByOccupancy,
} from './agentRoomsOccupancyFilter';

describe('agentRoomsOccupancyFilter', () => {
  const rooms = [
    { id: 'a', taskCount: 3 },
    { id: 'b', taskCount: 0 },
    { id: 'c', taskCount: null },
  ];

  it('filters with tasks vs empty', () => {
    expect(filterAgentRoomsByOccupancy(rooms, 'all')).toHaveLength(3);
    expect(filterAgentRoomsByOccupancy(rooms, 'with_tasks').map((r) => r.id)).toEqual(['a']);
    expect(filterAgentRoomsByOccupancy(rooms, 'empty').map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('detects when chips are useful', () => {
    expect(agentRoomsOccupancyFilterUseful(rooms)).toBe(true);
    expect(agentRoomsOccupancyFilterUseful([{ taskCount: 1 }, { taskCount: 2 }])).toBe(false);
  });

  it('labels filters', () => {
    expect(agentRoomsOccupancyLabel('empty')).toBe('Empty');
    expect(agentRoomsOccupancyLabel('all')).toBe('All rooms');
  });
});
