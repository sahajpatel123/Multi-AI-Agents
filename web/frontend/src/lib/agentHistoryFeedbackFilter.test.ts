import { describe, expect, it } from 'vitest';
import {
  agentHistoryFeedbackFilterUseful,
  agentHistoryFeedbackLabel,
  filterAgentHistoryByFeedback,
} from './agentHistoryFeedbackFilter';

describe('agentHistoryFeedbackFilter', () => {
  const items = [
    { id: 'a', user_feedback: 'accurate' },
    { id: 'b', user_feedback: 'partial' },
    { id: 'c', user_feedback: 'inaccurate' },
    { id: 'd', user_feedback: null },
    { id: 'e' }, // undefined
    { id: 'f', user_feedback: 'ACCURATE' }, // case-insensitive
    { id: 'g', user_feedback: '  partial  ' }, // whitespace
    { id: 'h', user_feedback: 'unsupported-value' }, // unknown verdict → unrated
  ];

  it('returns all items when filter is all', () => {
    expect(filterAgentHistoryByFeedback(items, 'all')).toHaveLength(8);
  });

  it('keeps only accurate-rated items', () => {
    expect(filterAgentHistoryByFeedback(items, 'accurate').map((i) => i.id)).toEqual([
      'a',
      'f',
    ]);
  });

  it('keeps only partial-rated items', () => {
    expect(filterAgentHistoryByFeedback(items, 'partial').map((i) => i.id)).toEqual([
      'b',
      'g',
    ]);
  });

  it('keeps only inaccurate-rated items', () => {
    expect(filterAgentHistoryByFeedback(items, 'inaccurate').map((i) => i.id)).toEqual(['c']);
  });

  it('keeps unrated (null / undefined / empty / unknown verdicts)', () => {
    expect(filterAgentHistoryByFeedback(items, 'unrated').map((i) => i.id)).toEqual([
      'd',
      'e',
      'h',
    ]);
  });

  it('does not mutate input', () => {
    const copy = items.map((i) => ({ ...i }));
    filterAgentHistoryByFeedback(items, 'accurate');
    expect(items).toEqual(copy);
  });

  it('handles empty / null input', () => {
    expect(filterAgentHistoryByFeedback([], 'accurate')).toEqual([]);
    expect(filterAgentHistoryByFeedback(undefined as unknown as never[], 'all')).toEqual([]);
  });

  it('detects when chips are useful', () => {
    expect(agentHistoryFeedbackFilterUseful(items)).toBe(true);
    expect(
      agentHistoryFeedbackFilterUseful([
        { user_feedback: null },
        { user_feedback: undefined },
        { user_feedback: '' },
        { user_feedback: 'mystery' },
      ]),
    ).toBe(false);
    expect(agentHistoryFeedbackFilterUseful([])).toBe(false);
  });

  it('labels filters', () => {
    expect(agentHistoryFeedbackLabel('accurate')).toBe('Accurate');
    expect(agentHistoryFeedbackLabel('partial')).toBe('Partial');
    expect(agentHistoryFeedbackLabel('inaccurate')).toBe('Inaccurate');
    expect(agentHistoryFeedbackLabel('unrated')).toBe('Unrated');
    expect(agentHistoryFeedbackLabel('all')).toBe('All ratings');
  });
});
