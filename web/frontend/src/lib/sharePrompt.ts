import { ARENA_PROMPT_MAX_CHARS } from './charBudget';
import { safeSessionStorage } from './safeStorage';

/**
 * Handoff for shared Arena take/round landings ("Try this in Arena").
 *
 * The question is carried through sessionStorage instead of a `?prompt=`
 * URL parameter so it survives the sign-in redirect without tripping the
 * open-redirect query-string guard (which rejects `//` inside query values —
 * common in prompts that cite URLs) and without inflating the shared link.
 * The value is read once when Arena mounts, pre-fills the compose box, and
 * is cleared immediately so a reload can never re-apply a stale question.
 */

export const SHARED_PROMPT_STORAGE_KEY = 'arena_shared_prompt:v1';
export const SHARED_PROMPT_MAX_LEN = ARENA_PROMPT_MAX_CHARS;

/**
 * Normalize a shared question for the handoff: strips embedded NUL bytes
 * (they break storage/URL boundaries), trims surrounding whitespace, and
 * clamps to the Arena compose limit so an oversized share payload can never
 * overflow the prompt box.
 */
export function sanitizeSharedPrompt(
  raw: string | null | undefined,
  max = SHARED_PROMPT_MAX_LEN,
): string {
  if (!raw) return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\u0000/g, '').trim().slice(0, max);
}

/**
 * Stage a shared question for the next Arena mount. Empty values clear any
 * previously staged question so a prompt-less or expired share landing can
 * never leave a stale handoff behind for the next Arena visit.
 */
export function saveSharedArenaPrompt(prompt: string): void {
  const clean = sanitizeSharedPrompt(prompt);
  if (!clean) {
    clearSharedArenaPrompt();
    return;
  }
  safeSessionStorage.setItem(SHARED_PROMPT_STORAGE_KEY, clean);
}

/** Read the staged question without consuming it (consumed after mount). */
export function readSharedArenaPrompt(): string {
  return sanitizeSharedPrompt(safeSessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY));
}

/** Remove any staged question so a later visit never re-applies it. */
export function clearSharedArenaPrompt(): void {
  safeSessionStorage.removeItem(SHARED_PROMPT_STORAGE_KEY);
}
