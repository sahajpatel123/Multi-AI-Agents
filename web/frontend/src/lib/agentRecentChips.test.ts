import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDismissedAgentChips,
  dismissAgentChip,
  loadDismissedAgentChipIds,
  pickRecentAgentChips,
} from './agentRecentChips';

describe('pickRecentAgentChips', () => {
  beforeEach(() => {
    clearDismissedAgentChips();
    localStorage.clear();
  });

  afterEach(() => {
    clearDismissedAgentChips();
  });

  it('takes up to limit items with title preferred for label', () => {
    const chips = pickRecentAgentChips(
      [
        { task_id: '1', title: 'SaaS market', task_text: 'Research the SaaS market deeply' },
        { task_id: '2', title: null, task_text: 'AI regulation outlook' },
        { task_id: '3', task_text: 'Third' },
        { task_id: '4', task_text: 'Fourth' },
        { task_id: '5', task_text: 'Fifth' },
      ],
      4,
    );
    expect(chips).toHaveLength(4);
    expect(chips[0]).toEqual({
      task_id: '1',
      label: 'SaaS market',
      task_text: 'Research the SaaS market deeply',
    });
    expect(chips[1].label).toBe('AI regulation outlook');
    expect(chips.map((c) => c.task_id)).not.toContain('5');
  });

  it('skips empty task text', () => {
    expect(
      pickRecentAgentChips([
        { task_id: 'x', task_text: '   ' },
        { task_id: 'y', task_text: 'Real question' },
      ]),
    ).toEqual([{ task_id: 'y', label: 'Real question', task_text: 'Real question' }]);
  });

  it('skips dismissed ids and persists dismissals', () => {
    dismissAgentChip('1');
    expect(loadDismissedAgentChipIds().has('1')).toBe(true);
    const chips = pickRecentAgentChips(
      [
        { task_id: '1', task_text: 'Hidden' },
        { task_id: '2', task_text: 'Visible' },
      ],
      4,
      loadDismissedAgentChipIds(),
    );
    expect(chips.map((c) => c.task_id)).toEqual(['2']);
    clearDismissedAgentChips();
    expect(loadDismissedAgentChipIds().size).toBe(0);
  });
});

describe('agentRecentChips same-tab storage notification', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('dispatches a synthetic storage event on dismissAgentChip', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      dismissAgentChip('abc-123');
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena_agent_chip_dismissed_v1');
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearDismissedAgentChips', () => {
    dismissAgentChip('x');
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearDismissedAgentChips();
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena_agent_chip_dismissed_v1');
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});
