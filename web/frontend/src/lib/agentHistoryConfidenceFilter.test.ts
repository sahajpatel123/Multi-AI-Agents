import { describe, expect, it } from 'vitest';
import {
  agentHistoryConfidenceFilterUseful,
  agentHistoryConfidenceLabel,
  filterAgentHistoryByConfidence,
} from './agentHistoryConfidenceFilter';

describe('agentHistoryConfidenceFilter', () => {
  const items = [
    { id: 'a', final_confidence: 88 },
    { id: 'b', final_confidence: 62 },
    { id: 'c', final_confidence: 40 },
    { id: 'd', final_confidence: null },
    { id: 'e' },
  ];

  it('filters by confidence bands', () => {
    expect(filterAgentHistoryByConfidence(items, 'all')).toHaveLength(5);
    expect(filterAgentHistoryByConfidence(items, 'high').map((i) => i.id)).toEqual(['a']);
    expect(filterAgentHistoryByConfidence(items, 'solid').map((i) => i.id)).toEqual(['b']);
    expect(filterAgentHistoryByConfidence(items, 'mixed').map((i) => i.id)).toEqual(['c']);
    expect(filterAgentHistoryByConfidence(items, 'unrated').map((i) => i.id)).toEqual(['d', 'e']);
  });

  it('treats NaN and undefined as unrated', () => {
    const dirty = [
      { id: 'x', final_confidence: Number.NaN },
      { id: 'y', final_confidence: Number.POSITIVE_INFINITY },
      { id: 'z', final_confidence: 50 },
    ];
    expect(filterAgentHistoryByConfidence(dirty, 'unrated').map((i) => i.id)).toEqual([
      'x',
      'y',
    ]);
    expect(filterAgentHistoryByConfidence(dirty, 'high')).toHaveLength(0);
    expect(filterAgentHistoryByConfidence(dirty, 'mixed').map((i) => i.id)).toEqual(['z']);
  });

  it('handles edge of band 75/60', () => {
    const edges = [
      { id: 'top', final_confidence: 75 },
      { id: 'between', final_confidence: 74.999 },
      { id: 'floor', final_confidence: 60 },
      { id: 'under', final_confidence: 59.999 },
    ];
    expect(filterAgentHistoryByConfidence(edges, 'high').map((i) => i.id)).toEqual(['top']);
    expect(filterAgentHistoryByConfidence(edges, 'solid').map((i) => i.id)).toEqual([
      'between',
      'floor',
    ]);
    expect(filterAgentHistoryByConfidence(edges, 'mixed').map((i) => i.id)).toEqual(['under']);
  });

  it('does not mutate input', () => {
    const copy = items.map((i) => ({ ...i }));
    filterAgentHistoryByConfidence(items, 'high');
    expect(items).toEqual(copy);
  });

  it('handles empty input', () => {
    expect(filterAgentHistoryByConfidence([], 'high')).toEqual([]);
    expect(filterAgentHistoryByConfidence(undefined as unknown as never[], 'all')).toEqual([]);
  });

  it('detects when chips are useful', () => {
    expect(agentHistoryConfidenceFilterUseful(items)).toBe(true);
    expect(
      agentHistoryConfidenceFilterUseful([
        { final_confidence: null },
        { final_confidence: undefined },
      ]),
    ).toBe(false);
    expect(agentHistoryConfidenceFilterUseful([])).toBe(false);
  });

  it('labels filters', () => {
    expect(agentHistoryConfidenceLabel('high')).toBe('75+');
    expect(agentHistoryConfidenceLabel('solid')).toBe('60–74');
    expect(agentHistoryConfidenceLabel('mixed')).toBe('Below 60');
    expect(agentHistoryConfidenceLabel('unrated')).toBe('No rating');
    expect(agentHistoryConfidenceLabel('all')).toBe('All confidence');
  });
});
