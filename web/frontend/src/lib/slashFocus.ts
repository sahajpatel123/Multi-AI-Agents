/**
 * Whether a bare `/` keypress should move focus to the primary compose field.
 * Skips when the user is already typing in a form control.
 */
export function shouldCaptureSlashFocus(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (target.isContentEditable) return false;
  // role=textbox (e.g. custom editors)
  if (target.getAttribute('role') === 'textbox') return false;
  return true;
}

/**
 * True for `/` without meta/ctrl/alt (Shift is ok for some layouts; we only match key === '/').
 */
export function isBareSlashKey(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (event.key !== '/') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return true;
}

/**
 * True for End without modifiers (used to jump to the live end of a chat
 * thread when the user is not typing in a form control).
 */
export function isBareEndKey(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  if (event.key !== 'End') return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  return true;
}
