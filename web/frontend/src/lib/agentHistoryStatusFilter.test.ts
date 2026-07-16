import { describe, expect, it } from 'vitest';
import {
  agentHistoryStatusLabel,
  filterAgentHistoryByStatus,
} from './agentHistoryStatusFilter';

const sample = [
  { id: '1', isLive: true },
  { id: '2', isLive: false },
  { id: '3', isLive: true },
  { id: '4' },
];

describe('filterAgentHistoryByStatus', () => {
  it('returns all when filter is all', () => {
    expect(filterAgentHistoryByStatus(sample, 'all').map((i) => i.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('keeps only live weekly tasks', () => {
    expect(filterAgentHistoryByStatus(sample, 'live').map((i) => i.id)).toEqual(['1', '3']);
  });

  it('keeps one-off / non-live tasks', () => {
    expect(filterAgentHistoryByStatus(sample, 'completed').map((i) => i.id)).toEqual([
      '2',
      '4',
    ]);
  });

  it('does not mutate input', () => {
    const copy = [...sample];
    filterAgentHistoryByStatus(sample, 'live');
    expect(sample).toEqual(copy);
  });
});

describe('agentHistoryStatusLabel', () => {
  it('returns human labels', () => {
    expect(agentHistoryStatusLabel('live')).toBe('Live');
    expect(agentHistoryStatusLabel('completed')).toBe('One-off');
    expect(agentHistoryStatusLabel('all')).toBe('All');
  });
});
