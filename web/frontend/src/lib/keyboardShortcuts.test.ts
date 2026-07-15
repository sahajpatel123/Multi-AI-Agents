import { describe, expect, it } from 'vitest';
import {
  isBareQuestionHelpKey,
  shortcutsForSurface,
  shortcutsPanelTitle,
} from './keyboardShortcuts';

describe('keyboardShortcuts', () => {
  it('lists primary shortcuts per surface', () => {
    expect(shortcutsForSurface('arena').some((s) => s.keys === '/')).toBe(true);
    expect(shortcutsForSurface('agent').some((s) => s.action.includes('follow-up'))).toBe(true);
    expect(shortcutsForSurface('discuss').some((s) => s.keys === 'Enter')).toBe(true);
    expect(shortcutsForSurface('debate').some((s) => s.keys === '?')).toBe(true);
    expect(shortcutsForSurface('room').some((s) => s.action.includes('board'))).toBe(true);
    expect(shortcutsForSurface('room').some((s) => s.keys === 'Esc')).toBe(true);
    expect(shortcutsForSurface('watchlist').some((s) => s.action.includes('watchlist search'))).toBe(
      true,
    );
  });

  it('titles panels by surface', () => {
    expect(shortcutsPanelTitle('arena')).toContain('Arena');
    expect(shortcutsPanelTitle('agent')).toContain('Agent');
    expect(shortcutsPanelTitle('room')).toContain('Room');
    expect(shortcutsPanelTitle('watchlist')).toContain('Watchlist');
  });

  it('detects bare question-mark help key', () => {
    expect(isBareQuestionHelpKey({ key: '?' })).toBe(true);
    expect(isBareQuestionHelpKey({ key: '?', metaKey: true })).toBe(false);
    expect(isBareQuestionHelpKey({ key: '/' })).toBe(false);
  });
});
