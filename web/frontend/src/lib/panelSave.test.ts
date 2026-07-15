import { describe, expect, it } from 'vitest';
import {
  PANEL_SAVE_BUSY_LABEL,
  PANEL_SAVE_ERROR_FALLBACK,
  PANEL_SAVE_IDLE_LABEL,
  PANEL_SAVE_SUCCESS_MESSAGE,
  panelSaveButtonLabel,
  panelSaveCaughtErrorMessage,
  panelSaveSuccessMessage,
  panelSaveToastAriaLive,
  panelSaveToastRole,
} from './panelSave';

describe('panelSave', () => {
  it('returns stable success copy', () => {
    expect(panelSaveSuccessMessage()).toBe(PANEL_SAVE_SUCCESS_MESSAGE);
    expect(PANEL_SAVE_SUCCESS_MESSAGE).toMatch(/loads every session/i);
  });

  it('maps caught errors to human copy', () => {
    expect(panelSaveCaughtErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(panelSaveCaughtErrorMessage({})).toBe(PANEL_SAVE_ERROR_FALLBACK);
    expect(panelSaveCaughtErrorMessage(null)).toMatch(/try again/i);
  });

  it('toggles save button label while busy', () => {
    expect(panelSaveButtonLabel(false)).toBe(PANEL_SAVE_IDLE_LABEL);
    expect(panelSaveButtonLabel(true)).toBe(PANEL_SAVE_BUSY_LABEL);
  });

  it('uses alert/assertive for errors and status/polite for success', () => {
    expect(panelSaveToastRole('success')).toBe('status');
    expect(panelSaveToastRole('error')).toBe('alert');
    expect(panelSaveToastAriaLive('success')).toBe('polite');
    expect(panelSaveToastAriaLive('error')).toBe('assertive');
  });
});
