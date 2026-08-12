import { describe, expect, it } from 'vitest';
import {
  isArenaCopyQuestionKey,
  isArenaCopyWinnerKey,
  isArenaDownloadWinnerKey,
  isBareQuestionHelpKey,
  shortcutsForSurface,
  shortcutsPanelTitle,
} from './keyboardShortcuts';

describe('keyboardShortcuts', () => {
  it('lists primary shortcuts per surface', () => {
    expect(shortcutsForSurface('arena').some((s) => s.keys === '/')).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys.includes('↑') && s.action.toLowerCase().includes('recent prompts'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + C' && s.action.toLowerCase().includes('winning take'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('winning take'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + Q' && s.action.toLowerCase().includes('question'),
      ),
    ).toBe(true);
    expect(shortcutsForSurface('agent').some((s) => s.action.includes('follow-up'))).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Esc' && s.action.toLowerCase().includes('rename'),
      ),
    ).toBe(true);
    expect(shortcutsForSurface('discuss').some((s) => s.keys === 'Enter')).toBe(true);
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'End' && s.action.toLowerCase().includes('latest'),
      ),
    ).toBe(true);
    expect(shortcutsForSurface('discuss').some((s) => s.keys === 'Esc' && s.action.includes('Arena'))).toBe(
      true,
    );
    expect(shortcutsForSurface('debate').some((s) => s.keys === '?')).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'End' && s.action.toLowerCase().includes('latest'),
      ),
    ).toBe(true);
    expect(shortcutsForSurface('debate').some((s) => s.keys === 'Esc' && s.action.includes('Arena'))).toBe(
      true,
    );
    expect(shortcutsForSurface('room').some((s) => s.action.includes('board'))).toBe(true);
    expect(shortcutsForSurface('room').some((s) => s.action.includes('filter'))).toBe(true);
    expect(shortcutsForSurface('room').some((s) => s.keys === 'Esc')).toBe(true);
    expect(shortcutsForSurface('watchlist').some((s) => s.action.includes('watchlist search'))).toBe(
      true,
    );
    expect(shortcutsForSurface('personas').some((s) => s.action.includes('library'))).toBe(true);
  });

  it('exposes persona-playground shortcuts', () => {
    const list = shortcutsForSurface('persona-playground');
    expect(list.some((s) => s.keys === '/' && s.action.includes('hub search'))).toBe(true);
    expect(list.some((s) => s.keys.includes('K') && s.action.toLowerCase().includes('command palette'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + l'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + m'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + c'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + s'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + t'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + r'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + e'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + f'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + a'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + g'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + w'))).toBe(true);
    expect(list.some((s) => s.keys.toLowerCase().includes('shift + p'))).toBe(true);
    expect(list.some((s) => s.keys === '←  →')).toBe(true);
    expect(list.some((s) => s.keys === 'Esc')).toBe(true);
    expect(list.some((s) => s.keys === '?')).toBe(true);
  });

  it('titles panels by surface', () => {
    expect(shortcutsPanelTitle('arena')).toContain('Arena');
    expect(shortcutsPanelTitle('agent')).toContain('Agent');
    expect(shortcutsPanelTitle('room')).toContain('Room');
    expect(shortcutsPanelTitle('watchlist')).toContain('Watchlist');
    expect(shortcutsPanelTitle('personas')).toContain('Personas');
    expect(shortcutsPanelTitle('persona-playground')).toContain('Persona Playground');
  });

  it('detects bare question-mark help key', () => {
    expect(isBareQuestionHelpKey({ key: '?' })).toBe(true);
    expect(isBareQuestionHelpKey({ key: '?', metaKey: true })).toBe(false);
    expect(isBareQuestionHelpKey({ key: '/' })).toBe(false);
  });

  it('detects Arena export shortcuts as bare Shift+letter keys', () => {
    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isArenaCopyWinnerKey({ key: 'c', shiftKey: true })).toBe(true);
    expect(isArenaCopyWinnerKey({ key: 'C' })).toBe(false);
    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaCopyWinnerKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isArenaDownloadWinnerKey({ key: 'd', shiftKey: true })).toBe(true);
    expect(isArenaDownloadWinnerKey({ key: 'D' })).toBe(false);
    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaDownloadWinnerKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true })).toBe(true);
    expect(isArenaCopyQuestionKey({ key: 'q', shiftKey: true })).toBe(true);
    expect(isArenaCopyQuestionKey({ key: 'Q' })).toBe(false);
    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true, altKey: true })).toBe(false);
    expect(isArenaCopyQuestionKey({ key: 'C', shiftKey: true })).toBe(false);
  });
});
