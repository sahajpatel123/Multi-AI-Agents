import { describe, expect, it } from 'vitest';
import {
  isArenaCopyAllTakesKey,
  isArenaCopyRoundJsonKey,
  isArenaCopyQuestionKey,
  isArenaCopyTranscriptMarkdownKey,
  isArenaCopyTranscriptJsonKey,
  isArenaCopyTranscriptCsvKey,
  isArenaCopyWinnerKey,
  isArenaDownloadTranscriptKey,
  isArenaDownloadTranscriptCsvKey,
  isArenaDownloadTranscriptJsonKey,
  isArenaDownloadRoundCsvKey,
  isArenaDownloadRoundMarkdownKey,
  isArenaDownloadRoundJsonKey,
  isArenaDownloadWinnerKey,
  isArenaNewTaskKey,
  isArenaReRunRoundKey,
  isArenaSaveWinnerKey,
  isArenaShareRoundKey,
  isArenaVerifyWinnerKey,
  isAgentCopyAnswerKey,
  isAgentCopyReportCsvKey,
  isAgentCopyReportKey,
  isAgentCopyReportJsonKey,
  isAgentDownloadAnswerKey,
  isAgentDownloadJsonKey,
  isAgentDownloadReportCsvKey,
  isAgentDownloadReportMarkdownKey,
  isAgentNewTaskKey,
  isBareQuestionHelpKey,
  isThreadCopyMarkdownKey,
  isThreadDownloadMarkdownKey,
  isThreadCopyJsonKey,
  isThreadDownloadJsonKey,
  isWatchlistCopyKey,
  isWatchlistDownloadCsvKey,
  isWatchlistDownloadMarkdownKey,
  isWatchlistDownloadStatsCsvKey,
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
        (s) => s.keys === 'Shift + A' && s.action.toLowerCase().includes('all four takes'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('winning take'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + W' && s.action.toLowerCase().includes('csv'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + G' && s.action.toLowerCase().includes('markdown'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + O' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + J' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('arena').some(
        (s) => s.keys === 'Shift + F' && s.action.toLowerCase().includes('public link'),
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
        (s) => s.keys === 'Shift + I' && s.action.toLowerCase().includes('csv'),
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
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'Shift + C' && s.action.toLowerCase().includes('1-on-1'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('download'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'Shift + C' && s.action.toLowerCase().includes('debate transcript'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('debate transcript'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'Shift + O' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('discuss').some(
        (s) => s.keys === 'Shift + J' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'Shift + O' && s.action.toLowerCase().includes('json'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('debate').some(
        (s) => s.keys === 'Shift + J' && s.action.toLowerCase().includes('json'),
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
        (s) => s.keys === 'Shift + L' && s.action.toLowerCase().includes('markdown'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + K' && s.action.toLowerCase().includes('csv'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + I' && s.action.toLowerCase().includes('csv'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + P' && s.action.toLowerCase().includes('research report'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('agent').some(
        (s) => s.keys === 'Shift + O' && s.action.toLowerCase().includes('json'),
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
    expect(
      shortcutsForSurface('watchlist').some(
        (s) => s.keys === 'Shift + C' && s.action.toLowerCase().includes('copy'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('watchlist').some(
        (s) => s.keys === 'Shift + D' && s.action.toLowerCase().includes('download'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('watchlist').some(
        (s) => s.keys === 'Shift + E' && s.action.toLowerCase().includes('csv'),
      ),
    ).toBe(true);
    expect(
      shortcutsForSurface('watchlist').some(
        (s) => s.keys === 'Shift + F' && s.action.toLowerCase().includes('statistics'),
      ),
    ).toBe(true);
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

    expect(isArenaCopyAllTakesKey({ key: 'A', shiftKey: true })).toBe(true);
    expect(isArenaCopyAllTakesKey({ key: 'a', shiftKey: true })).toBe(true);
    expect(isArenaCopyAllTakesKey({ key: 'A' })).toBe(false);
    expect(isArenaCopyAllTakesKey({ key: 'A', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaCopyAllTakesKey({ key: 'C', shiftKey: true })).toBe(false);

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

    expect(isArenaShareRoundKey({ key: 'F', shiftKey: true })).toBe(true);
    expect(isArenaShareRoundKey({ key: 'f', shiftKey: true })).toBe(true);
    expect(isArenaShareRoundKey({ key: 'F' })).toBe(false);
    expect(isArenaShareRoundKey({ key: 'F', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaShareRoundKey({ key: 'C', shiftKey: true })).toBe(false);

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

    expect(isArenaCopyTranscriptCsvKey({ key: 'I', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptCsvKey({ key: 'i', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptCsvKey({ key: 'I' })).toBe(false);
    expect(isArenaCopyTranscriptCsvKey({ key: 'I', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaCopyTranscriptCsvKey({ key: 'U', shiftKey: true })).toBe(false);

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

    expect(isArenaDownloadRoundCsvKey({ key: 'W', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundCsvKey({ key: 'w', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundCsvKey({ key: 'W' })).toBe(false);
    expect(isArenaDownloadRoundCsvKey({ key: 'W', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaDownloadRoundCsvKey({ key: 'U', shiftKey: true })).toBe(false);

    expect(isArenaDownloadRoundMarkdownKey({ key: 'G', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'g', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'G' })).toBe(false);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'G', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'W', shiftKey: true })).toBe(false);
  });

  it('detects Arena full-round JSON shortcuts as bare Shift+letter keys', () => {
    expect(isArenaCopyRoundJsonKey({ key: 'O', shiftKey: true })).toBe(true);
    expect(isArenaCopyRoundJsonKey({ key: 'o', shiftKey: true })).toBe(true);
    expect(isArenaCopyRoundJsonKey({ key: 'O' })).toBe(false);
    expect(isArenaCopyRoundJsonKey({ key: 'O', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isArenaCopyRoundJsonKey({ key: 'J', shiftKey: true })).toBe(false);
    expect(isArenaDownloadRoundJsonKey({ key: 'J', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundJsonKey({ key: 'j', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundJsonKey({ key: 'J' })).toBe(false);
    expect(isArenaDownloadRoundJsonKey({ key: 'J', shiftKey: true, metaKey: true })).toBe(false);
    expect(isArenaDownloadRoundJsonKey({ key: 'O', shiftKey: true })).toBe(false);
  });

  it('detects Discuss/Debate thread JSON shortcuts as bare Shift+letter keys', () => {
    expect(isThreadCopyJsonKey({ key: 'O', shiftKey: true })).toBe(true);
    expect(isThreadCopyJsonKey({ key: 'o', shiftKey: true })).toBe(true);
    expect(isThreadCopyJsonKey({ key: 'O' })).toBe(false);
    expect(isThreadCopyJsonKey({ key: 'O', shiftKey: true, metaKey: true })).toBe(false);
    expect(isThreadCopyJsonKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isThreadDownloadJsonKey({ key: 'J', shiftKey: true })).toBe(true);
    expect(isThreadDownloadJsonKey({ key: 'j', shiftKey: true })).toBe(true);
    expect(isThreadDownloadJsonKey({ key: 'J' })).toBe(false);
    expect(isThreadDownloadJsonKey({ key: 'J', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isThreadDownloadJsonKey({ key: 'O', shiftKey: true })).toBe(false);

    expect(isThreadCopyJsonKey({ key: 'O', shiftKey: true, repeat: true })).toBe(false);
    expect(isThreadDownloadJsonKey({ key: 'J', shiftKey: true, repeat: true })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'O', shiftKey: true })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'J', shiftKey: true })).toBe(false);
  });

  it('ignores OS auto-repeat so holding a key cannot spam exports', () => {
    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyWinnerKey({ key: 'c', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyAllTakesKey({ key: 'A', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyTranscriptCsvKey({ key: 'I', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadRoundCsvKey({ key: 'W', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'G', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaCopyRoundJsonKey({ key: 'O', shiftKey: true, repeat: true })).toBe(false);
    expect(isArenaDownloadRoundJsonKey({ key: 'J', shiftKey: true, repeat: true })).toBe(false);

    expect(isArenaCopyWinnerKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isArenaCopyAllTakesKey({ key: 'A', shiftKey: true })).toBe(true);
    expect(isArenaDownloadWinnerKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isArenaCopyQuestionKey({ key: 'Q', shiftKey: true })).toBe(true);
    expect(isArenaSaveWinnerKey({ key: 'S', shiftKey: true })).toBe(true);
    expect(isArenaVerifyWinnerKey({ key: 'V', shiftKey: true })).toBe(true);
    expect(isArenaReRunRoundKey({ key: 'R', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptMarkdownKey({ key: 'E', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptJsonKey({ key: 'K', shiftKey: true })).toBe(true);
    expect(isArenaCopyTranscriptCsvKey({ key: 'I', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptKey({ key: 'T', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptJsonKey({ key: 'Y', shiftKey: true })).toBe(true);
    expect(isArenaDownloadTranscriptCsvKey({ key: 'U', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundCsvKey({ key: 'W', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundMarkdownKey({ key: 'G', shiftKey: true })).toBe(true);
    expect(isArenaCopyRoundJsonKey({ key: 'O', shiftKey: true })).toBe(true);
    expect(isArenaDownloadRoundJsonKey({ key: 'J', shiftKey: true })).toBe(true);
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

    expect(isAgentDownloadReportMarkdownKey({ key: 'L', shiftKey: true })).toBe(true);
    expect(isAgentDownloadReportMarkdownKey({ key: 'l', shiftKey: true })).toBe(true);
    expect(isAgentDownloadReportMarkdownKey({ key: 'L' })).toBe(false);
    expect(isAgentDownloadReportMarkdownKey({ key: 'L', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentDownloadReportMarkdownKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isAgentDownloadReportCsvKey({ key: 'K', shiftKey: true })).toBe(true);
    expect(isAgentDownloadReportCsvKey({ key: 'k', shiftKey: true })).toBe(true);
    expect(isAgentDownloadReportCsvKey({ key: 'K' })).toBe(false);
    expect(isAgentDownloadReportCsvKey({ key: 'K', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentDownloadReportCsvKey({ key: 'K', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentDownloadReportCsvKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isAgentCopyReportCsvKey({ key: 'I', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportCsvKey({ key: 'i', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportCsvKey({ key: 'I' })).toBe(false);
    expect(isAgentCopyReportCsvKey({ key: 'I', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentCopyReportCsvKey({ key: 'I', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentCopyReportCsvKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isAgentCopyReportKey({ key: 'P', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportKey({ key: 'p', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportKey({ key: 'P' })).toBe(false);
    expect(isAgentCopyReportKey({ key: 'P', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentCopyReportKey({ key: 'P', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentCopyReportKey({ key: 'J', shiftKey: true })).toBe(false);

    expect(isAgentCopyReportJsonKey({ key: 'O', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportJsonKey({ key: 'o', shiftKey: true })).toBe(true);
    expect(isAgentCopyReportJsonKey({ key: 'O' })).toBe(false);
    expect(isAgentCopyReportJsonKey({ key: 'O', shiftKey: true, metaKey: true })).toBe(false);
    expect(isAgentCopyReportJsonKey({ key: 'O', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isAgentCopyReportJsonKey({ key: 'J', shiftKey: true })).toBe(false);

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
    expect(isAgentDownloadReportMarkdownKey({ key: 'L', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentDownloadReportCsvKey({ key: 'K', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentCopyReportCsvKey({ key: 'I', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentCopyReportKey({ key: 'P', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentCopyReportJsonKey({ key: 'O', shiftKey: true, repeat: true })).toBe(false);
    expect(isAgentNewTaskKey({ key: 'N', shiftKey: true, repeat: true })).toBe(false);
  });

  it('detects Watchlist export shortcuts as bare Shift+letter keys', () => {
    expect(isWatchlistCopyKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isWatchlistCopyKey({ key: 'c', shiftKey: true })).toBe(true);
    expect(isWatchlistCopyKey({ key: 'C' })).toBe(false);
    expect(isWatchlistCopyKey({ key: 'C', shiftKey: true, metaKey: true })).toBe(false);
    expect(isWatchlistCopyKey({ key: 'C', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isWatchlistCopyKey({ key: 'C', shiftKey: true, altKey: true })).toBe(false);
    expect(isWatchlistCopyKey({ key: 'C', shiftKey: true, repeat: true })).toBe(false);
    expect(isWatchlistCopyKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isWatchlistDownloadMarkdownKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadMarkdownKey({ key: 'd', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadMarkdownKey({ key: 'D' })).toBe(false);
    expect(isWatchlistDownloadMarkdownKey({ key: 'D', shiftKey: true, metaKey: true })).toBe(false);
    expect(isWatchlistDownloadMarkdownKey({ key: 'D', shiftKey: true, repeat: true })).toBe(false);
    expect(isWatchlistDownloadMarkdownKey({ key: 'C', shiftKey: true })).toBe(false);

    expect(isWatchlistDownloadCsvKey({ key: 'E', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadCsvKey({ key: 'e', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadCsvKey({ key: 'E' })).toBe(false);
    expect(isWatchlistDownloadCsvKey({ key: 'E', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isWatchlistDownloadCsvKey({ key: 'E', shiftKey: true, repeat: true })).toBe(false);
    expect(isWatchlistDownloadCsvKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isWatchlistDownloadStatsCsvKey({ key: 'F', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadStatsCsvKey({ key: 'f', shiftKey: true })).toBe(true);
    expect(isWatchlistDownloadStatsCsvKey({ key: 'F' })).toBe(false);
    expect(isWatchlistDownloadStatsCsvKey({ key: 'F', shiftKey: true, metaKey: true })).toBe(false);
    expect(isWatchlistDownloadStatsCsvKey({ key: 'F', shiftKey: true, repeat: true })).toBe(false);
    expect(isWatchlistDownloadStatsCsvKey({ key: 'E', shiftKey: true })).toBe(false);
  });

  it('detects Discuss/Debate thread export shortcuts as bare Shift+letter keys', () => {
    expect(isThreadCopyMarkdownKey({ key: 'C', shiftKey: true })).toBe(true);
    expect(isThreadCopyMarkdownKey({ key: 'c', shiftKey: true })).toBe(true);
    expect(isThreadCopyMarkdownKey({ key: 'C' })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'C', shiftKey: true, metaKey: true })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'C', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'C', shiftKey: true, altKey: true })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'C', shiftKey: true, repeat: true })).toBe(false);
    expect(isThreadCopyMarkdownKey({ key: 'D', shiftKey: true })).toBe(false);

    expect(isThreadDownloadMarkdownKey({ key: 'D', shiftKey: true })).toBe(true);
    expect(isThreadDownloadMarkdownKey({ key: 'd', shiftKey: true })).toBe(true);
    expect(isThreadDownloadMarkdownKey({ key: 'D' })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'D', shiftKey: true, metaKey: true })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'D', shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'D', shiftKey: true, altKey: true })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'D', shiftKey: true, repeat: true })).toBe(false);
    expect(isThreadDownloadMarkdownKey({ key: 'C', shiftKey: true })).toBe(false);
  });
});
