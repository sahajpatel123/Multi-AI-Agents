import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_HISTORY_PINS_MAX,
  AGENT_HISTORY_PINS_STORAGE_KEY,
  loadAgentHistoryPins,
  normalizeAgentHistoryPins,
  persistAgentHistoryPins,
  removeAgentHistoryPins,
  toggleAgentHistoryPin,
} from './agentHistoryPins';

describe('normalizeAgentHistoryPins', () => {
  it('returns an empty list for non-array or missing input', () => {
    expect(normalizeAgentHistoryPins(null)).toEqual([]);
    expect(normalizeAgentHistoryPins('tasks')).toEqual([]);
    expect(normalizeAgentHistoryPins([1, true, ''])).toEqual([]);
  });

  it('keeps only unique non-empty task ids', () => {
    expect(
      normalizeAgentHistoryPins(['task-1', ' task-1 ', 'task-2', '', 42]),
    ).toEqual(['task-1', 'task-2']);
  });

  it('bounds the pin list to the max', () => {
    const ids = Array.from({ length: AGENT_HISTORY_PINS_MAX + 20 }, (_, i) => `task-${i}`);
    expect(normalizeAgentHistoryPins(ids)).toHaveLength(AGENT_HISTORY_PINS_MAX);
  });
});

describe('agent history pin storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips pinned task ids', () => {
    persistAgentHistoryPins(['task-a', 'task-b']);
    expect(loadAgentHistoryPins()).toEqual(['task-a', 'task-b']);
  });

  it('falls back to an empty list for corrupt storage', () => {
    window.localStorage.setItem(AGENT_HISTORY_PINS_STORAGE_KEY, '{not json');
    expect(loadAgentHistoryPins()).toEqual([]);
  });

  it('toggles a pin on and off', () => {
    const first = toggleAgentHistoryPin('task-a');
    expect(first).toEqual(['task-a']);
    expect(loadAgentHistoryPins()).toEqual(['task-a']);
    const second = toggleAgentHistoryPin('task-a');
    expect(second).toEqual([]);
    expect(loadAgentHistoryPins()).toEqual([]);
  });

  it('normalizes whitespace around a pinned task id', () => {
    const first = toggleAgentHistoryPin('  task-a  ');
    expect(first).toEqual(['task-a']);
    expect(loadAgentHistoryPins()).toEqual(['task-a']);
    const second = toggleAgentHistoryPin('task-a');
    expect(second).toEqual([]);
    expect(loadAgentHistoryPins()).toEqual([]);
  });

  it('does not pin blank task ids', () => {
    persistAgentHistoryPins(['task-a']);
    expect(toggleAgentHistoryPin('   ')).toEqual(['task-a']);
    expect(loadAgentHistoryPins()).toEqual(['task-a']);
  });

  it('evicts the oldest pin instead of dropping a new one at the cap', () => {
    const full = Array.from({ length: AGENT_HISTORY_PINS_MAX }, (_, i) => `task-${i}`);
    persistAgentHistoryPins(full);
    const next = toggleAgentHistoryPin('task-new');
    expect(next).toHaveLength(AGENT_HISTORY_PINS_MAX);
    expect(next[next.length - 1]).toBe('task-new');
    expect(next[0]).toBe('task-1');
    expect(next).not.toContain('task-0');
    expect(loadAgentHistoryPins()).toEqual(next);
  });

  it('removes pins for deleted tasks while keeping others', () => {
    persistAgentHistoryPins(['task-a', 'task-b', 'task-c']);
    const next = removeAgentHistoryPins(['task-b', 'missing']);
    expect(next).toEqual(['task-a', 'task-c']);
    expect(loadAgentHistoryPins()).toEqual(['task-a', 'task-c']);
  });
});
