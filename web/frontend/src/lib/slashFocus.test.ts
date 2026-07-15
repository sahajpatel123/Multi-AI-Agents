import { describe, expect, it } from 'vitest';
import { isBareSlashKey, shouldCaptureSlashFocus } from './slashFocus';

describe('slashFocus', () => {
  it('isBareSlashKey ignores modified slashes', () => {
    expect(isBareSlashKey({ key: '/' })).toBe(true);
    expect(isBareSlashKey({ key: '/', metaKey: true })).toBe(false);
    expect(isBareSlashKey({ key: '/', ctrlKey: true })).toBe(false);
    expect(isBareSlashKey({ key: '/', altKey: true })).toBe(false);
    expect(isBareSlashKey({ key: 'a' })).toBe(false);
  });

  it('shouldCaptureSlashFocus skips form controls', () => {
    expect(shouldCaptureSlashFocus(null)).toBe(true);

    const input = document.createElement('input');
    expect(shouldCaptureSlashFocus(input)).toBe(false);

    const ta = document.createElement('textarea');
    expect(shouldCaptureSlashFocus(ta)).toBe(false);

    const div = document.createElement('div');
    expect(shouldCaptureSlashFocus(div)).toBe(true);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom may not flip isContentEditable from the attribute alone
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(shouldCaptureSlashFocus(editable)).toBe(false);
  });
});
