/**
 * Draft autosave for the Arena prompt (and any other composable text field).
 *
 * The point is to survive page reloads, route changes, and accidental
 * navigations: if the user typed a long prompt and lost it before sending,
 * we bring it back on next mount. The store is intentionally narrow:
 * one text blob per caller-supplied key.
 *
 * Consumers must opt in by passing a `storageKey` — there is no implicit
 * write, so unrelated text fields cannot collide.
 *
 * The Draft library intentionally does NOT clear the draft on submit
 * success: callers are expected to call clearPromptDraft() only after they
 * have positive confirmation that the request landed. This lets a failed
 * submit preserve the work for the next mount instead of silently throwing
 * it away.
 */

const MAX_LEN = 2000;

export function loadPromptDraft(storageKey: string): string {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return '';
    return raw.slice(0, MAX_LEN);
  } catch {
    /* storage unavailable (private mode, quota) — fail open */
    return '';
  }
}

export function savePromptDraft(storageKey: string, text: string): void {
  const trimmed = text.trim();
  try {
    if (!trimmed) {
      // Empty or whitespace-only — there is no draft worth restoring.
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, text.slice(0, MAX_LEN));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearPromptDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}