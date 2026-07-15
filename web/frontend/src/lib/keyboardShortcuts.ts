/** Pure keyboard shortcut catalogs for Arena product surfaces. */

export type ShortcutHint = {
  keys: string;
  action: string;
};

export type ShortcutSurface = 'arena' | 'agent' | 'discuss' | 'debate' | 'room' | 'watchlist';

const ARENA: ShortcutHint[] = [
  { keys: '/', action: 'Focus the Arena prompt' },
  { keys: 'Enter', action: 'Send your question' },
  { keys: 'Esc', action: 'Close a focused mind' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const AGENT: ShortcutHint[] = [
  { keys: '/', action: 'Focus research compose or follow-up' },
  { keys: 'Enter', action: 'Run task or send follow-up' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DISCUSS: ShortcutHint[] = [
  { keys: '/', action: 'Focus the discuss message box' },
  { keys: 'Enter', action: 'Send message' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DEBATE: ShortcutHint[] = [
  { keys: '/', action: 'Focus debate interjection' },
  { keys: 'Enter', action: 'Send interjection' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const ROOM: ShortcutHint[] = [
  { keys: '/', action: 'Focus board or history search' },
  { keys: 'Esc', action: 'Close the add-task picker' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const WATCHLIST: ShortcutHint[] = [
  { keys: '/', action: 'Focus watchlist search' },
  { keys: 'Esc', action: 'Cancel pending remove' },
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
