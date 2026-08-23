/**
 * Prompt-history cycling for the Arena compose box.
 *
 * The history list is most-recent-first (index 0 = the most recent prompt),
 * matching the ordering of the recent-prompts chips. ArrowUp walks back
 * through it from the current draft; ArrowDown walks forward and finally
 * restores the draft the user was editing before they stepped into history.
 *
 * Kept outside React so the stepping rules can be unit-tested without a DOM.
 */

export const NO_HISTORY_ENTRY = -1;

export interface PromptHistoryState {
  /** Index into the most-recent-first history list; -1 means "editing the draft". */
  index: number;
  /** The draft captured when the user first stepped into history. */
  draft: string;
}

export function createPromptHistoryState(): PromptHistoryState {
  return { index: NO_HISTORY_ENTRY, draft: '' };
}

export interface PromptHistoryStep {
  /** The value the compose box should show after the step. */
  value: string;
  /** The next history state (unchanged when the step was a no-op). */
  state: PromptHistoryState;
  /** Whether the step actually moved through history. */
  changed: boolean;
}

export function stepPromptHistory(
  direction: 'up' | 'down',
  state: PromptHistoryState,
  currentValue: string,
  history: readonly string[],
): PromptHistoryStep {
  if (direction === 'up') {
    if (history.length === 0) {
      return { value: currentValue, state, changed: false };
    }
    if (state.index === NO_HISTORY_ENTRY) {
      return {
        value: history[0],
        state: { index: 0, draft: currentValue },
        changed: true,
      };
    }
    if (state.index + 1 >= history.length) {
      return { value: currentValue, state, changed: false };
    }
    const nextIndex = state.index + 1;
    return {
      value: history[nextIndex],
      state: { ...state, index: nextIndex },
      changed: true,
    };
  }

  if (state.index === NO_HISTORY_ENTRY) {
    return { value: currentValue, state, changed: false };
  }
  if (history.length === 0 || state.index >= history.length) {
    // A stale position (e.g. history shrank mid-walk) cannot be stepped
    // backward from, so leave the walk and restore the saved draft.
    return {
      value: state.draft,
      state: createPromptHistoryState(),
      changed: true,
    };
  }
  if (state.index === 0) {
    return {
      value: state.draft,
      state: createPromptHistoryState(),
      changed: true,
    };
  }
  const nextIndex = state.index - 1;
  return {
    value: history[nextIndex],
    state: { ...state, index: nextIndex },
    changed: true,
  };
}

/**
 * Whether a keydown should be considered a prompt-history step: bare
 * ArrowUp/ArrowDown with no modifier keys and no active IME composition.
 */
export function shouldCapturePromptHistoryKey(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}): boolean {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.isComposing) return false;
  return true;
}
