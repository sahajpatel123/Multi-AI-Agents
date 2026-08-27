import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_HISTORY_PIN_FILTER_ALL,
  AGENT_HISTORY_PIN_FILTER_OPTIONS,
  AGENT_HISTORY_PINS_MAX,
  AGENT_HISTORY_PINS_STORAGE_KEY,
  agentHistoryPinFilterLabel,
  agentHistoryPinFilterUseful,
  filterAgentHistoryByPin,
  loadAgentHistoryPins,
  normalizeAgentHistoryPins,
  persistAgentHistoryPins,
  removeAgentHistoryPins,
  subscribeToAgentHistoryPins,
  toggleAgentHistoryPin,
} from './agentHistoryPins';

describe('agent history pin filter', () => {
  const tasks = [
    { task_id: 'task-a', title: 'Alpha' },
    { taskId: 'task-b', title: 'Beta' },
    { id: 'task-c', title: 'Gamma' },
  ];

  it('exposes clear filter labels', () => {
    expect(AGENT_HISTORY_PIN_FILTER_OPTIONS).toEqual([
      { value: 'all', label: 'All tasks' },
      { value: 'pinned', label: 'Pinned only' },
    ]);
    expect(agentHistoryPinFilterLabel('pinned')).toBe('Pinned only');
    expect(agentHistoryPinFilterLabel(AGENT_HISTORY_PIN_FILTER_ALL)).toBe('All tasks');
  });

  it('returns only pinned rows across supported id shapes', () => {
    expect(filterAgentHistoryByPin(tasks, 'pinned', [' task-a ', 'task-c'])).toEqual([
      tasks[0],
      tasks[2],
    ]);
  });

  it('returns a fresh unmodified list for all or malformed filters', () => {
    const all = filterAgentHistoryByPin(tasks, 'all', ['task-a']);
    const malformed = filterAgentHistoryByPin(tasks, 'future' as never, ['task-a']);
    expect(all).toEqual(tasks);
    expect(all).not.toBe(tasks);
    expect(malformed).toEqual(tasks);
    expect(tasks.map((task) => task.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('only reports the filter useful for pins present in retained history', () => {
    expect(agentHistoryPinFilterUseful(tasks, ['task-b', 'missing'])).toBe(true);
    expect(agentHistoryPinFilterUseful(tasks, ['missing'])).toBe(false);
    expect(agentHistoryPinFilterUseful(tasks, [])).toBe(false);
  });
});

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

  it('notifies subscribers with normalized pins after a same-tab write', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToAgentHistoryPins(onChange);
    try {
      persistAgentHistoryPins([' task-a ', 'task-a', 'task-b']);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(['task-a', 'task-b']);
    } finally {
      unsubscribe();
    }
  });

  it('observes matching cross-tab updates and storage clears only', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToAgentHistoryPins(onChange);
    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated-key',
          newValue: JSON.stringify(['ignored']),
        }),
      );
      expect(onChange).not.toHaveBeenCalled();

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AGENT_HISTORY_PINS_STORAGE_KEY,
          newValue: JSON.stringify([' task-a ', '', 'task-b']),
        }),
      );
      expect(onChange).toHaveBeenLastCalledWith(['task-a', 'task-b']);

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AGENT_HISTORY_PINS_STORAGE_KEY,
          newValue: '{not json',
        }),
      );
      expect(onChange).toHaveBeenLastCalledWith([]);

      window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));
      expect(onChange).toHaveBeenLastCalledWith([]);
      expect(onChange).toHaveBeenCalledTimes(3);
    } finally {
      unsubscribe();
    }
  });

  it('stops observing pin updates after unsubscribe', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToAgentHistoryPins(onChange);
    unsubscribe();
    persistAgentHistoryPins(['task-a']);
    expect(onChange).not.toHaveBeenCalled();
  });
});
