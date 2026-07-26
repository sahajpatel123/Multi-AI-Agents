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
  { keys: 'Esc', action: 'Close a focused mind' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const AGENT: ShortcutHint[] = [
  { keys: '/', action: 'Focus research compose or follow-up' },
  { keys: 'Enter', action: 'Run task or send follow-up' },
  { keys: 'Esc', action: 'Close attach menu, cadence picker, or rename' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DISCUSS: ShortcutHint[] = [
  { keys: '/', action: 'Focus the discuss message box' },
  { keys: 'Enter', action: 'Send message' },
  { keys: 'End', action: 'Jump to latest message' },
  { keys: 'Esc', action: 'Back to Arena' },
  { keys: '?', action: 'Toggle this shortcuts list' },
];

const DEBATE: ShortcutHint[] = [
  { keys: '/', action: 'Focus debate interjection' },
  { keys: 'Enter', action: 'Send interjection' },
  { keys: 'End', action: 'Jump to latest in the thread' },
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
