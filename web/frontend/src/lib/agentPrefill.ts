import { AGENT_TASK_MAX_CHARS, clampToMax } from './charBudget';

/** Short-lived handoff from a public report (or another Agent surface). */
export const AGENT_PREFILL_STORAGE_KEY = 'arena_prefill_question';

/**
 * Store a question for the next Agent page mount.
 *
 * The value is deliberately bounded to the same limit as the Agent compose
 * field so a public payload cannot create an un-submittable draft.
 */
export function saveAgentPrefillQuestion(question: string | null | undefined): void {
  const normalized = typeof question === 'string' ? question.trim() : '';
  try {
    if (!normalized) {
      sessionStorage.removeItem(AGENT_PREFILL_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      AGENT_PREFILL_STORAGE_KEY,
      clampToMax(normalized, AGENT_TASK_MAX_CHARS),
    );
  } catch {
    // Private browsing or a storage policy must not block navigation.
  }
}

/**
 * Read and clear the one-shot Agent handoff.
 *
 * Explicit route state wins over a session handoff. This prevents an
 * abandoned sign-in or an old tab action from overwriting `/agent?q=...` or
 * `/agent?task_id=...` when the user later opens Agent Mode.
 */
export function takeAgentPrefillQuestion(options: { hasExplicitTask?: boolean } = {}): string {
  try {
    const value = sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY);
    sessionStorage.removeItem(AGENT_PREFILL_STORAGE_KEY);
    if (options.hasExplicitTask || !value) return '';
    return clampToMax(value.trim(), AGENT_TASK_MAX_CHARS);
  } catch {
    return '';
  }
}
