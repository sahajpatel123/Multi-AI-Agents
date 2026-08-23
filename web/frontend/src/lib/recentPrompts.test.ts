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

  it('collapses duplicate entries and keeps the pinned flag', () => {
    localStorage.setItem(
      'arena-recent-prompts-storage-v1',
      JSON.stringify([
        { text: 'Alpha', at: 1 },
        { text: 'alpha', at: 2, pinned: true },
        { text: 'Beta', at: 3, pinned: true },
        { text: '', at: 4 },
      ]),
    );
    const items = loadRecentPrompts();
    expect(items).toEqual([
      { text: 'Alpha', at: 1, pinned: true },
      { text: 'Beta', at: 3, pinned: true },
    ]);
  });

  it('ignores malformed storage instead of throwing', () => {
    localStorage.setItem('arena-recent-prompts-storage-v1', '{not valid json');
    expect(loadRecentPrompts()).toEqual([]);

    localStorage.setItem('arena-recent-prompts-storage-v1', '{"text":"not an array"}');
    expect(loadRecentPrompts()).toEqual([]);
  });

  it('keeps pinned prompts even when storage is larger than the cap', () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({
      text: `Prompt ${i}`,
      at: i,
      pinned: i >= 7,
    }));
    localStorage.setItem('arena-recent-prompts-storage-v1', JSON.stringify(raw));

    const items = loadRecentPrompts();
    expect(items).toHaveLength(8);
    expect(items.filter((item) => item.pinned).map((item) => item.text)).toEqual([
      'Prompt 7',
      'Prompt 8',
      'Prompt 9',
    ]);
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

  it('never evicts a pinned prompt when the list is full', () => {
    for (let i = 0; i < 8; i += 1) {
      pushRecentPrompt(`Prompt ${i}`);
    }
    for (let i = 0; i < 8; i += 1) {
      setRecentPromptPinned(`Prompt ${i}`, true);
    }

    const next = pushRecentPrompt('Brand new');
    expect(next.filter((item) => item.pinned)).toHaveLength(8);
    expect(next.map((item) => item.text)).toContain('Brand new');
    expect(loadRecentPrompts().filter((item) => item.pinned)).toHaveLength(8);
  });

  it('trims back to the cap when an over-cap pinned prompt is unpinned', () => {
    for (let i = 0; i < 8; i += 1) {
      pushRecentPrompt(`Prompt ${i}`);
    }
    for (let i = 0; i < 8; i += 1) {
      setRecentPromptPinned(`Prompt ${i}`, true);
    }
    pushRecentPrompt('Brand new');

    const next = setRecentPromptPinned('Prompt 7', false);
    expect(next).toHaveLength(8);
    expect(next.filter((item) => item.pinned)).toHaveLength(7);
    expect(next.map((item) => item.text)).toContain('Brand new');
  });

  it('keeps the newest prompt even when pushes share a wall-clock millisecond', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_750_000_000_000);
      for (let i = 0; i < 8; i += 1) {
        pushRecentPrompt(`Prompt ${i}`);
      }
      for (let i = 0; i < 8; i += 1) {
        setRecentPromptPinned(`Prompt ${i}`, true);
      }
      pushRecentPrompt('Brand new');

      const next = setRecentPromptPinned('Prompt 7', false);
      expect(next).toHaveLength(8);
      expect(next.filter((item) => item.pinned)).toHaveLength(7);
      expect(next.map((item) => item.text)).toContain('Brand new');
    } finally {
      vi.useRealTimers();
    }
  });
});
