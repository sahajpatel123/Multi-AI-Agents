import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentPrompts,
  loadRecentPrompts,
  pushRecentPrompt,
} from './recentPrompts';

describe('recentPrompts', () => {
  beforeEach(() => {
    clearRecentPrompts();
    localStorage.clear();
  });

  afterEach(() => {
    clearRecentPrompts();
    vi.restoreAllMocks();
  });

  it('returns empty when nothing stored', () => {
    expect(loadRecentPrompts()).toEqual([]);
  });

  it('stores newest first and dedupes case-insensitively', () => {
    pushRecentPrompt('Should I ship?');
    pushRecentPrompt('What about pricing?');
    pushRecentPrompt('should i ship?');
    const items = loadRecentPrompts();
    expect(items.map((i) => i.text)).toEqual(['should i ship?', 'What about pricing?']);
  });

  it('caps at 8 items', () => {
    for (let i = 0; i < 12; i += 1) {
      pushRecentPrompt(`Prompt number ${i}`);
    }
    expect(loadRecentPrompts()).toHaveLength(8);
    expect(loadRecentPrompts()[0].text).toBe('Prompt number 11');
  });
});
