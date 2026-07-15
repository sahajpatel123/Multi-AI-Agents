/** Pure copy / a11y helpers for Personas panel save UX. */

export type PanelSaveToastKind = 'success' | 'error';

export const PANEL_SAVE_SUCCESS_MESSAGE = 'Panel saved — loads every session';
export const PANEL_SAVE_ERROR_FALLBACK = 'Could not save panel. Check your connection and try again.';
export const PANEL_SAVE_BUSY_LABEL = 'Saving…';
export const PANEL_SAVE_IDLE_LABEL = 'Save this panel';

export function panelSaveSuccessMessage(): string {
  return PANEL_SAVE_SUCCESS_MESSAGE;
}

export function panelSaveCaughtErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return PANEL_SAVE_ERROR_FALLBACK;
}

export function panelSaveButtonLabel(saving: boolean): string {
  return saving ? PANEL_SAVE_BUSY_LABEL : PANEL_SAVE_IDLE_LABEL;
}

/** Live region role: polite status for success, assertive alert for failures. */
export function panelSaveToastRole(kind: PanelSaveToastKind): 'status' | 'alert' {
  return kind === 'error' ? 'alert' : 'status';
}

export function panelSaveToastAriaLive(kind: PanelSaveToastKind): 'polite' | 'assertive' {
  return kind === 'error' ? 'assertive' : 'polite';
}
