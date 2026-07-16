import { describe, expect, it } from 'vitest';
import {
  formatHistoryConfidenceBadge,
  formatHistoryRowRelative,
  historyItemCopyText,
  historyItemRerunText,
  historyRowTimeTitle,
} from './agentHistoryRow';

const NOW = Date.parse('2026-07-16T12:00:00Z');

describe('historyItemRerunText', () => {
  it('returns trimmed task_text', () => {
    expect(historyItemRerunText({ task_text: '  What is X?  ' })).toBe('What is X?');
  });

  it('returns empty when missing', () => {
    expect(historyItemRerunText({})).toBe('');
    expect(historyItemRerunText(null)).toBe('');
  });
});

describe('historyItemCopyText', () => {
  it('prefers task_text over title', () => {
    expect(
      historyItemCopyText({ task_text: 'Full question', title: 'Short' }),
    ).toBe('Full question');
  });

  it('falls back to title', () => {
    expect(historyItemCopyText({ task_text: '  ', title: 'Short title' })).toBe(
      'Short title',
    );
  });
});

describe('formatHistoryRowRelative', () => {
  it('renders minutes ago with injected now', () => {
    expect(formatHistoryRowRelative('2026-07-16T11:45:00Z', NOW)).toBe('15m ago');
  });

  it('falls back for invalid', () => {
    expect(formatHistoryRowRelative(null, NOW)).toBe('—');
  });
});

describe('historyRowTimeTitle', () => {
  it('formats absolute UTC minute precision', () => {
    expect(historyRowTimeTitle('2026-07-16T11:45:00Z')).toBe('2026-07-16 11:45 UTC');
  });

  it('empty on null', () => {
    expect(historyRowTimeTitle(null)).toBe('');
  });
});

describe('formatHistoryConfidenceBadge', () => {
  it('handles 0–1 fraction', () => {
    expect(formatHistoryConfidenceBadge(0.72)).toBe('72%');
  });

  it('handles already-percent values', () => {
    expect(formatHistoryConfidenceBadge(88)).toBe('88%');
  });

  it('returns null for missing / out of range', () => {
    expect(formatHistoryConfidenceBadge(null)).toBeNull();
    expect(formatHistoryConfidenceBadge(NaN)).toBeNull();
    expect(formatHistoryConfidenceBadge(140)).toBeNull();
  });
});
