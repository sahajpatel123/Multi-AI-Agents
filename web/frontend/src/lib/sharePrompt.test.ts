import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHARED_PROMPT_STORAGE_KEY,
  clearSharedArenaPrompt,
  readSharedArenaPrompt,
  sanitizeSharedPrompt,
  saveSharedArenaPrompt,
} from './sharePrompt';

describe('sharePrompt', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('sanitizes shared prompts (NULs, whitespace, length)', () => {
    expect(sanitizeSharedPrompt(null)).toBe('');
    expect(sanitizeSharedPrompt('  around  ')).toBe('around');
    expect(sanitizeSharedPrompt('a\u0000b')).toBe('ab');
    expect(sanitizeSharedPrompt('x'.repeat(2500))).toHaveLength(2000);
  });

  it('round-trips a staged question through sessionStorage', () => {
    saveSharedArenaPrompt('Should we ship today?');
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBe('Should we ship today?');
    expect(readSharedArenaPrompt()).toBe('Should we ship today?');
  });

  it('ignores empty or whitespace-only prompts', () => {
    saveSharedArenaPrompt('');
    saveSharedArenaPrompt('   ');
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBeNull();
  });

  it('clears a previously staged prompt when an empty prompt is saved', () => {
    saveSharedArenaPrompt('Older question from a previous share');
    saveSharedArenaPrompt('');
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBeNull();
    expect(readSharedArenaPrompt()).toBe('');
  });

  it('clear removes the staged question', () => {
    saveSharedArenaPrompt('A question');
    clearSharedArenaPrompt();
    expect(sessionStorage.getItem(SHARED_PROMPT_STORAGE_KEY)).toBeNull();
    expect(readSharedArenaPrompt()).toBe('');
  });

  it('degrades gracefully when sessionStorage throws', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readSharedArenaPrompt()).toBe('');
    expect(() => saveSharedArenaPrompt('a question')).not.toThrow();
    expect(() => clearSharedArenaPrompt()).not.toThrow();
  });
});
