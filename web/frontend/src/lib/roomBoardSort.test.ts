import { describe, expect, it } from 'vitest';
import { roomBoardSortLabel, sortRoomBoardTasks } from './roomBoardSort';

const sample = [
  {
    id: 'a',
    title: 'Zebra',
    author: 'Ben',
    score: 70,
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'b',
    title: 'Alpha',
    author: 'Ada',
    score: 90,
    createdAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'c',
    title: 'Middle',
    author: 'Cara',
    score: null,
    createdAt: '2026-04-01T00:00:00Z',
  },
];

describe('sortRoomBoardTasks', () => {
  it('sorts newest first by default', () => {
    const ids = sortRoomBoardTasks(sample, 'newest').map((t) => t.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('sorts oldest first', () => {
    const ids = sortRoomBoardTasks(sample, 'oldest').map((t) => t.id);
    expect(ids).toEqual(['a', 'c', 'b']);
  });

  it('sorts by score high to low with missing last', () => {
    const ids = sortRoomBoardTasks(sample, 'score_desc').map((t) => t.id);
    expect(ids).toEqual(['b', 'a', 'c']);
  });

  it('sorts by score low to high with missing last', () => {
    const ids = sortRoomBoardTasks(sample, 'score_asc').map((t) => t.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('sorts by author then title', () => {
    const ids = sortRoomBoardTasks(sample, 'author').map((t) => t.id);
    expect(ids).toEqual(['b', 'a', 'c']);
  });

  it('sorts by title', () => {
    const ids = sortRoomBoardTasks(sample, 'title').map((t) => t.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    sortRoomBoardTasks(sample, 'title');
    expect(sample).toEqual(copy);
  });
});

describe('roomBoardSortLabel', () => {
  it('returns human labels', () => {
    expect(roomBoardSortLabel('score_desc')).toBe('Score · high');
    expect(roomBoardSortLabel('newest')).toBe('Newest');
  });
});
