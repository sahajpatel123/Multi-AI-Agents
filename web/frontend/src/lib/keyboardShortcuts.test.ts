import { describe, expect, it } from 'vitest';
import {
  isArenaCopyQuestionKey,
  isArenaCopyTranscriptMarkdownKey,
  isArenaCopyTranscriptJsonKey,
  isArenaCopyWinnerKey,
  isArenaDownloadTranscriptKey,
  isArenaDownloadTranscriptCsvKey,
  isArenaDownloadTranscriptJsonKey,
  isArenaDownloadWinnerKey,
  isArenaNewTaskKey,
  isArenaReRunRoundKey,
  isArenaSaveWinnerKey,
  isArenaVerifyWinnerKey,
  isAgentCopyAnswerKey,
  isAgentDownloadAnswerKey,
  isAgentDownloadJsonKey,
  isAgentNewTaskKey,
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
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + K' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + E' && s.action.toLowerCase().includes('markdown'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + T' && s.action.toLowerCase().includes('download'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + Y' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + U' && s.action.toLowerCase().includes('csv'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + S' && s.action.toLowerCase().includes('winning take'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + V' && s.action.toLowerCase().includes('agent mode'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + R' && s.action.toLowerCase().includes('re-run'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + N' && s.action.toLowerCase().includes('new arena task'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'Shift + N' && s.action.toLowerCase().includes('new arena task'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'Shift + N' && s.action.toLowerCase().includes('new arena task'),
      ),
    ).toBe(true);
    expect(shortcutsForSurface('agent').some((s) => s.action.includes('follow-up'))).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + C' && s.action.toLowerCase().includes('answer'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('markdown'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + J' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + N' && s.action.toLowerCase().includes('fresh'),
      ),
    ).toBe(true);
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
    expect(isArenaNewTaskKey({ key: 'N', shiftKey: true })).toBe(true);
    expect(isArenaNewTaskKey({ key: 'n', shiftKey: true })).toBe(true);
    expect(isArenaNewTaskKey({ key: 'N' })).toBe(false);
    expect(isArenaNewTaskKey({ key: 'N', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaNewTaskKey({ key: 'N', shiftKey: true, repeat: true })).toBe(false);
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

    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true })).toBe(true);
    expect(isArenaSaveWinnerKey({ key: 's', shiftKey: true })).toBe(true);
    expect(isArenaSaveWinnerKey({ key: 'S' })).toBe(false);
    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaSaveWinnerKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true })).toBe(true);
    expect(isArenaVerifyWinnerKey({ key: 'v', shiftKey: true })).toBe(true);
    expect(isArenaVerifyWinnerKey({ key: 'V' })).toBe(false);
    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaVerifyWinnerKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true })).toBe(true);
    expect(isArenaReRunRoundKey({ key: 'r', shiftKey: true })).toBe(true);
    expect(isArenaReRunRoundKey({ key: 'R' })).toBe(false);
    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaReRunRoundKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptJsonKey({ key: 'k', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K' })).toBe(false);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaCopyTranscriptJsonKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'e', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E' })).toBe(false);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true, altKey: true })).toBe(false);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'K', shiftKey: true })).toBe(false);

    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptKey({ key: 't', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptKey({ key: 'T' })).toBe(false);
    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaDownloadTranscriptKey({ key: 'E', shiftKey: true })).toBe(false);

    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'y', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y' })).toBe(false);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'T', shiftKey: true })).toBe(false);

    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'u', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U' })).toBe(false);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'Y', shiftKey: true })).toBe(false);
  });

  it('ignores OS auto-repeat so holding a key cannot spam exports', () => {
    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyWinnerKey({ key: 'c', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true, repeat: true })).toBe(false);

    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true })).toBe(true);
    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true })).toBe(true);
    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true })).toBe(true);
    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true })).toBe(true);
  });

  it('detects Agent result shortcuts as bare Shift+letter keys', () => {
    expect(isAgentCopyAnswerKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isAgentCopyAnswerKey({ key: 'c', shiftKey: true })).toBe(true);
    expect(isAgentCopyAnswerKey({ key: 'C' })).toBe(false);
    expect(isAgentCopyAnswerKey({ key: 'C', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentCopyAnswerKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isAgentDownloadAnswerKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isAgentDownloadAnswerKey({ key: 'd', shiftKey: true })).toBe(true);
    expect(isAgentDownloadAnswerKey({ key: 'D' })).toBe(false);
    expect(isAgentDownloadAnswerKey({ key: 'D', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentDownloadAnswerKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isAgentDownloadJsonKey({ key: 'J', shiftKey: true })).toBe(true);
    expect(isAgentDownloadJsonKey({ key: 'j', shiftKey: true })).toBe(true);
    expect(isAgentDownloadJsonKey({ key: 'J' })).toBe(false);
    expect(isAgentDownloadJsonKey({ key: 'J', shiftKey: true, altKey: true })).toBe(false);
    expect(isAgentDownloadJsonKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true })).toBe(true);
    expect(isAgentNewTaskKey({ key: 'n', shiftKey: true })).toBe(true);
    expect(isAgentNewTaskKey({ key: 'N' })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true, altKey: true })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isAgentCopyAnswerKey({ key: 'C', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentDownloadAnswerKey({ key: 'D', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentDownloadJsonKey({ key: 'J', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true, repeat: true })).toBe(false);
  });
});
