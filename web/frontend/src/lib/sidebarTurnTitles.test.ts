import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_TURN_TITLE_MAX,
  clearSidebarTurnTitles,
  loadSidebarTurnTitles,
  saveSidebarTurnTitle,
  sidebarTurnTitleIssueMessage,
  validateSidebarTurnTitle,
} from './sidebarTurnTitles';

describe('sidebarTurnTitles', () => {
  beforeEach(() => {
    clearSidebarTurnTitles();
  });

  it('validates titles', () => {
    expect(validateSidebarTurnTitle('')).toBe('title_required');
    expect(validateSidebarTurnTitle('  ')).toBe('title_required');
    expect(validateSidebarTurnTitle('My take')).toBeNull();
    expect(validateSidebarTurnTitle('x'.repeat(SIDEBAR_TURN_TITLE_MAX + 1))).toBe(
      'title_too_long',
    );
    expect(sidebarTurnTitleIssueMessage('title_required')).toMatch(/Esc/i);
  });

  it('persists and reloads titles', () => {
    const next = saveSidebarTurnTitle('turn_1', '  Pricing rethink  ');
    expect(next.turn_1).toBe('Pricing rethink');
    expect(loadSidebarTurnTitles().turn_1).toBe('Pricing rethink');
  });

  it('removes a title when saved empty', () => {
    saveSidebarTurnTitle('turn_1', 'Keep me');
    const next = saveSidebarTurnTitle('turn_1', '   ');
    expect(next.turn_1).toBeUndefined();
    expect(loadSidebarTurnTitles().turn_1).toBeUndefined();
  });
});

describe('sidebarTurnTitles same-tab storage notification', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('dispatches a synthetic storage event on saveSidebarTurnTitle', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      saveSidebarTurnTitle('turn_1', 'Pricing rethink');
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena_sidebar_turn_titles_v1');
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearSidebarTurnTitles', () => {
    saveSidebarTurnTitle('turn_1', 'Keep me');
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearSidebarTurnTitles();
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena_sidebar_turn_titles_v1');
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});
