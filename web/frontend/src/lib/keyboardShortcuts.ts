/** Pure keyboard shortcut catalogs for Arena product surfaces. */

export type ShortcutHint = {
  keys: string;
  action: string;
};

export type ShortcutSurface =
  | 'arena'
  | 'agent'
  | 'discuss'
  | 'debate'
  | 'room'
  | 'watchlist'
  | 'personas'
  | 'persona-playground';

const ARENA: ShortcutHint[] = [
  { keys: '/', action: 'Focus the Arena prompt' },
  { keys: 'Enter', action: 'Send your question' },
  { keys: '↑ / ↓', action: 'Cycle recent prompts in the compose box' },
  { keys: 'Shift + N', action: 'Start a new Arena task' },
  { keys: 'Shift + C', action: 'Copy the winning take' },
  { keys: 'Shift + A', action: 'Copy all four takes' },
  { keys: 'Shift + D', action: 'Download the winning take' },
  { keys: 'Shift + W', action: 'Download the full round as CSV' },
  { keys: 'Shift + G', action: 'Download the full round as markdown' },
  { keys: 'Shift + O', action: 'Copy the full round as JSON' },
  { keys: 'Shift + J', action: 'Download the full round as JSON' },
  { keys: 'Shift + F', action: 'Copy a public link to the full round' },
  { keys: 'Shift + S', action: 'Save or unsave the winning take' },
  { keys: 'Shift + B', action: 'Save all four takes to your saved library' },
  { keys: 'Shift + V', action: 'Verify the winning take in Agent Mode' },
  { keys: 'Shift + Q', action: 'Copy the question' },
  { keys: 'Shift + E', action: 'Copy the full session transcript as markdown' },
  { keys: 'Shift + T', action: 'Download the full session transcript as markdown' },
  { keys: 'Shift + K', action: 'Copy the full session transcript as JSON' },
  { keys: 'Shift + Y', action: 'Download the full session transcript as JSON' },
  { keys: 'Shift + U', action: 'Download the full session transcript as CSV' },
  { keys: 'Shift + I', action: 'Copy the full session transcript as CSV' },
  { keys: 'Shift + R', action: 'Re-run the round' },
  { keys: 'Esc', action: 'Close a focused mind' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const AGENT: ShortcutHint[] = [
  { keys: '/', action: 'Focus research compose or follow-up' },
  { keys: 'Enter', action: 'Run task or send follow-up' },
  { keys: 'Shift + N', action: 'Start a fresh Agent task' },
  { keys: 'Shift + C', action: 'Copy the completed answer as markdown' },
  { keys: 'Shift + D', action: 'Download the answer as a markdown file' },
  { keys: 'Shift + J', action: 'Download the full report as JSON' },
  { keys: 'Shift + L', action: 'Download the full research report as markdown' },
  { keys: 'Shift + K', action: 'Download the full research report as CSV' },
  { keys: 'Shift + I', action: 'Copy the full research report as CSV' },
  { keys: 'Shift + O', action: 'Copy the full research report as JSON' },
  { keys: 'Shift + P', action: 'Copy the full research report as markdown' },
  { keys: 'Esc', action: 'Close attach menu, cadence picker, or rename' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DISCUSS: ShortcutHint[] = [
  { keys: '/', action: 'Focus the discuss message box' },
  { keys: 'Enter', action: 'Send message' },
  { keys: 'End', action: 'Jump to latest message' },
  { keys: 'Shift + C', action: 'Copy the full 1-on-1 thread as markdown' },
  { keys: 'Shift + D', action: 'Download the full 1-on-1 thread as markdown' },
  { keys: 'Shift + O', action: 'Copy the full 1-on-1 thread as JSON' },
  { keys: 'Shift + J', action: 'Download the full 1-on-1 thread as JSON' },
  { keys: 'Shift + N', action: 'Start a new Arena task' },
  { keys: 'Esc', action: 'Back to Arena' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DEBATE: ShortcutHint[] = [
  { keys: '/', action: 'Focus debate interjection' },
  { keys: 'Enter', action: 'Send interjection' },
  { keys: 'End', action: 'Jump to latest in the thread' },
  { keys: 'Shift + C', action: 'Copy the full debate transcript as markdown' },
  { keys: 'Shift + D', action: 'Download the full debate transcript as markdown' },
  { keys: 'Shift + O', action: 'Copy the full debate transcript as JSON' },
  { keys: 'Shift + J', action: 'Download the full debate transcript as JSON' },
  { keys: 'Shift + N', action: 'Start a new Arena task' },
  { keys: 'Esc', action: 'Back to Arena' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const ROOM: ShortcutHint[] = [
  { keys: '/', action: 'Focus board or history search' },
  { keys: 'Esc', action: 'Close the add-task picker' },
  { keys: 'Member', action: 'Click a member to filter their board tasks' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const WATCHLIST: ShortcutHint[] = [
  { keys: '/', action: 'Focus watchlist search' },
  { keys: 'Shift + R', action: 'Run all active watches now' },
  { keys: 'Shift + C', action: 'Copy the current watchlist as markdown' },
  { keys: 'Shift + D', action: 'Download the current watchlist as markdown' },
  { keys: 'Shift + E', action: 'Download the current watchlist as CSV' },
  { keys: 'Shift + J', action: 'Download the current watchlist as JSON' },
  { keys: 'Shift + O', action: 'Copy the current watchlist as JSON' },
  { keys: 'Shift + M', action: 'Download completed results as a markdown digest' },
  { keys: 'Shift + F', action: 'Download watchlist statistics as CSV' },
  { keys: 'Esc', action: 'Cancel pending remove' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const PERSONAS: ShortcutHint[] = [
  { keys: '/', action: 'Focus library or swap search' },
  { keys: 'Esc', action: 'Close swap dialog or cancel reset' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const PERSONA_PLAYGROUND: ShortcutHint[] = [
  { keys: '/', action: 'Focus the hub search' },
  { keys: '⌘ K', action: 'Open the command palette' },
  { keys: 'Shift + L', action: 'Copy a link to this view' },
  { keys: 'Shift + M', action: 'Replay your most recent mood' },
  { keys: 'Shift + C', action: 'Replay your most recent category filter' },
  { keys: 'Shift + S', action: 'Replay your most recent search query' },
  { keys: 'Shift + T', action: 'Jump to your most recently visited tool' },
  { keys: 'Shift + R', action: 'Open a random persona tool' },
  { keys: 'Shift + E', action: 'Pin or unpin your most recently visited tool' },
  { keys: 'Shift + F', action: 'Open your favorites page' },
  { keys: 'Shift + A', action: 'Open the all-tools index' },
  { keys: 'Shift + G', action: 'Browse tools by category' },
  { keys: 'Shift + W', action: 'See what is new on the playground' },
  { keys: 'Shift + P', action: 'Open the sitemap' },
  { keys: '←  →', action: 'Rotate through mood chips' },
  { keys: 'Esc', action: 'Close the command palette' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

export function shortcutsForSurface(surface: ShortcutSurface): ShortcutHint[] {
  switch (surface) {
    case 'agent':
      return [...AGENT];
    case 'discuss':
      return [...DISCUSS];
    case 'debate':
      return [...DEBATE];
    case 'room':
      return [...ROOM];
    case 'watchlist':
      return [...WATCHLIST];
    case 'personas':
      return [...PERSONAS];
    case 'persona-playground':
      return [...PERSONA_PLAYGROUND];
    case 'arena':
    default:
      return [...ARENA];
  }
}

export function shortcutsPanelTitle(surface: ShortcutSurface): string {
  switch (surface) {
    case 'agent':
      return 'Agent Mode shortcuts';
    case 'discuss':
      return 'Discuss shortcuts';
    case 'debate':
      return 'Debate shortcuts';
    case 'room':
      return 'Room shortcuts';
    case 'watchlist':
      return 'Watchlist shortcuts';
    case 'personas':
      return 'Personas shortcuts';
    case 'persona-playground':
      return 'Persona Playground shortcuts';
    case 'arena':
    default:
      return 'Arena shortcuts';
  }
}

/** Bare `?` without modifier keys (Shift is ok — browsers report key as `?`). */
export function isBareQuestionHelpKey(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (event.key !== '?') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return true;
}

export type ShortcutKeyEvent = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
};

/**
 * True for a bare Shift+letter shortcut (no meta/ctrl/alt) so Arena can offer
 * keyboard-first export actions without stealing the user's typing. Repeats
 * from holding the key are ignored so one press means one copy/download.
 */
function isBareShiftLetterKey(
  event: ShortcutKeyEvent,
  letter:
    | 'a'
    | 'b'
    | 'c'
    | 'd'
    | 'q'
    | 's'
    | 'r'
    | 'j'
    | 'k'
    | 'e'
    | 'm'
    | 'n'
    | 'v'
    | 't'
    | 'y'
    | 'u'
    | 'i'
    | 'p'
    | 'o'
    | 'w'
    | 'g'
    | 'l'
    | 'f',
): boolean {
  if (event.repeat) return false;
  if (event.key.toLowerCase() !== letter) return false;
  if (!event.shiftKey) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return true;
}

/** Shift+C — copy the winning Arena take to the clipboard. */
export function isArenaCopyWinnerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'c');
}

/** Shift+A — copy all four Arena takes to the clipboard. */
export function isArenaCopyAllTakesKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'a');
}

/** Shift+D — download the winning Arena take as a Markdown file. */
export function isArenaDownloadWinnerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'd');
}

/** Shift+Q — copy the question behind the current Arena round. */
export function isArenaCopyQuestionKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'q');
}

/** Shift+S — save or unsave the winning Arena take in the saved-takes library. */
export function isArenaSaveWinnerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 's');
}

/** Shift+B — save every take in the current Arena round to the saved-takes library. */
export function isArenaSaveAllTakesKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'b');
}

/** Shift+V — send the winning Arena take into Agent Mode for deeper verification. */
export function isArenaVerifyWinnerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'v');
}

/** Shift+R — replay the last completed Arena round with the same prompt. */
export function isArenaReRunRoundKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'r');
}

/** Shift+N — reset the Arena to a fresh, empty task. */
export function isArenaNewTaskKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'n');
}

/** Shift+K — copy the full Arena session transcript as JSON. */
export function isArenaCopyTranscriptJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'k');
}

/** Shift+I — copy the full Arena session transcript as CSV. */
export function isArenaCopyTranscriptCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'i');
}

/** Shift+E — copy the full Arena session transcript as markdown. */
export function isArenaCopyTranscriptMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'e');
}

/** Shift+T — download the full Arena session transcript as a markdown file. */
export function isArenaDownloadTranscriptKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 't');
}

/** Shift+Y — download the full Arena session transcript as JSON. */
export function isArenaDownloadTranscriptJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'y');
}

/** Shift+U — download the full Arena session transcript as CSV. */
export function isArenaDownloadTranscriptCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'u');
}

/** Shift+W — download the current Arena round (all takes) as CSV. */
export function isArenaDownloadRoundCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'w');
}

/** Shift+G — download the current Arena round (all takes) as markdown. */
export function isArenaDownloadRoundMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'g');
}

/** Shift+O — copy the current Arena round (all takes) as JSON. */
export function isArenaCopyRoundJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'o');
}

/** Shift+J — download the current Arena round (all takes) as JSON. */
export function isArenaDownloadRoundJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'j');
}

/** Shift+F — copy a public link to the full Arena round. */
export function isArenaShareRoundKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'f');
}

/**
 * Shift+C — copy the full 1-on-1 Discuss thread (or Debate transcript) as
 * markdown. Same letter as Arena's "copy the winner" and Agent's "copy the
 * answer" so C consistently means "copy the primary content".
 */
export function isThreadCopyMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'c');
}

/**
 * Shift+D — download the full 1-on-1 Discuss thread (or Debate transcript)
 * as a markdown file. Same letter as Arena's "download the winner" and
 * Agent's "download the answer" so D consistently means "download it".
 */
export function isThreadDownloadMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'd');
}

/**
 * Shift+O — copy the full 1-on-1 Discuss thread (or Debate transcript) as
 * JSON. Same letter as Arena's "copy the round as JSON" and Agent's "copy the
 * report as JSON" so O consistently means "copy the structured export".
 */
export function isThreadCopyJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'o');
}

/**
 * Shift+J — download the full 1-on-1 Discuss thread (or Debate transcript)
 * as a JSON file. Same letter as Arena's "download the round as JSON" and
 * Agent's "download the report as JSON".
 */
export function isThreadDownloadJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'j');
}

/** Shift+C — copy a completed Agent answer to the clipboard as markdown. */
export function isAgentCopyAnswerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'c');
}

/** Shift+D — download a completed Agent answer as a markdown file. */
export function isAgentDownloadAnswerKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'd');
}

/** Shift+J — download the full Agent research report as JSON. */
export function isAgentDownloadJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'j');
}

/** Shift+L — download the full Agent research report as a markdown file. */
export function isAgentDownloadReportMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'l');
}

/** Shift+K — download the full Agent research report as a CSV file. */
export function isAgentDownloadReportCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'k');
}

/** Shift+I — copy the full Agent research report to the clipboard as CSV. */
export function isAgentCopyReportCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'i');
}

/** Shift+P — copy the full Agent research report to the clipboard as markdown. */
export function isAgentCopyReportKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'p');
}

/** Shift+O — copy the full Agent research report to the clipboard as JSON. */
export function isAgentCopyReportJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'o');
}

/** Shift+N — reset Agent Mode to a fresh, empty task. */
export function isAgentNewTaskKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'n');
}

/**
 * Shift+C — copy the current watchlist view as markdown. Same letter as
 * Arena/Agent/Discuss so C consistently means "copy the primary content".
 */
export function isWatchlistCopyKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'c');
}

/**
 * Shift+D — download the current watchlist view as a markdown file. Same
 * letter as the other surfaces so D consistently means "download it".
 */
export function isWatchlistDownloadMarkdownKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'd');
}

/**
 * Shift+M — download the completed-results digest for the current watchlist
 * view as a markdown file. M keeps the "markdown digest" action next to the
 * other watchlist exports without reusing Shift+D, which already downloads
 * the raw view.
 */
export function isWatchlistDownloadDigestKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'm');
}

/** Shift+E — download the current watchlist view as a CSV file. */
export function isWatchlistDownloadCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'e');
}

/** Shift+J — download the current watchlist view as a JSON file. */
export function isWatchlistDownloadJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'j');
}

/**
 * Shift+O — copy the current watchlist view as JSON. Same letter as the other
 * Arena surfaces so O consistently means "copy the structured export".
 */
export function isWatchlistCopyJsonKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'o');
}

/** Shift+F — download the full watchlist statistics report as CSV. */
export function isWatchlistDownloadStatsCsvKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'f');
}

/** Shift+R — start an immediate re-check for every active watch. */
export function isWatchlistRunAllKey(event: ShortcutKeyEvent): boolean {
  return isBareShiftLetterKey(event, 'r');
}
