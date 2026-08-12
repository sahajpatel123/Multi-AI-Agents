import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentPrompts,
  loadRecentPrompts,
  pushRecentPrompt,
  removeRecentPrompt,
  setRecentPromptPinned,
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

  it('removes a single prompt case-insensitively', () => {
    pushRecentPrompt('Alpha');
    pushRecentPrompt('Beta');
    const next = removeRecentPrompt('alpha');
    expect(next.map((i) => i.text)).toEqual(['Beta']);
    expect(loadRecentPrompts().map((i) => i.text)).toEqual(['Beta']);
  });

  it('treats legacy unpinned entries as unpinned', () => {
    localStorage.setItem(
      'arena-recent-prompts-storage-v1',
      JSON.stringify([{ text: 'Legacy prompt', at: 123 }]),
    );
    const items = loadRecentPrompts();
    expect(items).toHaveLength(1);
    expect(items[0].pinned).toBe(false);
  });

  it('pins and unpins a recent prompt', () => {
    pushRecentPrompt('Keep asking this');
    const pinned = setRecentPromptPinned('Keep asking this', true);
    expect(pinned[0].pinned).toBe(true);
    expect(loadRecentPrompts()[0].pinned).toBe(true);

    const unpinned = setRecentPromptPinned('keep asking this', false);
    expect(unpinned[0].pinned).toBe(false);
    expect(loadRecentPrompts()[0].pinned).toBe(false);
  });

  it('keeps a prompt pinned when it is reused later', () => {
    pushRecentPrompt('Weekly review');
    setRecentPromptPinned('Weekly review', true);
    pushRecentPrompt('Something new');
    pushRecentPrompt('Weekly review');

    const items = loadRecentPrompts();
    expect(items.map((i) => i.text)).toEqual(['Weekly review', 'Something new']);
    expect(items[0].pinned).toBe(true);
    expect(items[1].pinned).toBe(false);
  });

  it('new prompts are unpinned by default', () => {
    pushRecentPrompt('Fresh question');
    expect(loadRecentPrompts()[0].pinned).toBe(false);
  });
});
