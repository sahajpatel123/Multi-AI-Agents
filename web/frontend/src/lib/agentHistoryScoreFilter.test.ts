import { describe, expect, it } from 'vitest';
import {
  agentHistoryScoreFilterUseful,
  agentHistoryScoreLabel,
  filterAgentHistoryByScore,
} from './agentHistoryScoreFilter';

describe('agentHistoryScoreFilter', () => {
  const items = [
    { id: 'a', score: 88 },
    { id: 'b', final_score: 62 },
    { id: 'c', score: 40 },
    { id: 'd', score: null },
  ];

  it('filters by score bands', () => {
    expect(filterAgentHistoryByScore(items, 'all')).toHaveLength(4);
    expect(filterAgentHistoryByScore(items, 'high').map((i) => i.id)).toEqual(['a']);
    expect(filterAgentHistoryByScore(items, 'solid').map((i) => i.id)).toEqual(['b']);
    expect(filterAgentHistoryByScore(items, 'mixed').map((i) => i.id)).toEqual(['c']);
    expect(filterAgentHistoryByScore(items, 'unscored').map((i) => i.id)).toEqual(['d']);
  });

  it('detects when chips are useful', () => {
    expect(agentHistoryScoreFilterUseful(items)).toBe(true);
    expect(agentHistoryScoreFilterUseful([{ score: null }, { final_score: undefined }])).toBe(
      false,
    );
  });

  it('labels filters', () => {
    expect(agentHistoryScoreLabel('high')).toBe('75+');
    expect(agentHistoryScoreLabel('all')).toBe('All scores');
  });
});
