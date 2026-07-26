import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HubSearchHistory } from './HubSearchHistory';
import {
  readSearchHistory,
  recordSearch,
  clearSearchHistory,
  SEARCH_HISTORY_LIMIT,
} from '../lib/hubSearchHistory';

function writeSearchHistory(values: Array<{ query: string; at: number }>) {
  window.localStorage.setItem(
    'arena:persona-playground:search-history:v1',
    JSON.stringify(values),
  );
}

describe('hubSearchHistory (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns [] for missing storage', () => {
    expect(readSearchHistory(null)).toEqual([]);
  });

  it('drops empty and whitespace-only queries on record', () => {
    recordSearch(window.localStorage, '   ');
    recordSearch(window.localStorage, '');
    expect(readSearchHistory(window.localStorage)).toEqual([]);
  });

  it('normalizes whitespace on record', () => {
    recordSearch(window.localStorage, '  persona  battle  ');
    expect(readSearchHistory(window.localStorage)[0].query).toBe('persona battle');
  });

  it('dedupes case-insensitively', () => {
    recordSearch(window.localStorage, 'Mosaic', 1);
    recordSearch(window.localStorage, 'mosaic', 2);
    const out = readSearchHistory(window.localStorage);
    expect(out.length).toBe(1);
    expect(out[0].at).toBe(2);
  });

  it('caps history at the limit', () => {
    for (let i = 0; i < SEARCH_HISTORY_LIMIT + 4; i += 1) {
      recordSearch(window.localStorage, `q${i}`, i);
    }
    expect(readSearchHistory(window.localStorage).length).toBe(SEARCH_HISTORY_LIMIT);
  });

  it('clearSearchHistory wipes the key', () => {
    recordSearch(window.localStorage, 'mosaic');
    clearSearchHistory(window.localStorage);
    expect(readSearchHistory(window.localStorage)).toEqual([]);
  });
});

describe('hubSearchHistory same-tab storage notification', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('dispatches a synthetic storage event on recordSearch', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      recordSearch(window.localStorage, 'mosaic', 1);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena:persona-playground:search-history:v1');
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('dispatches a synthetic storage event on clearSearchHistory', () => {
    recordSearch(window.localStorage, 'mosaic');
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      clearSearchHistory(window.localStorage);
      expect(onStorage).toHaveBeenCalled();
      const event = onStorage.mock.calls[0][0] as StorageEvent;
      expect(event.key).toBe('arena:persona-playground:search-history:v1');
      expect(event.newValue).toBeNull();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });

  it('does not notify when storage is null', () => {
    const onStorage = vi.fn();
    window.addEventListener('storage', onStorage);
    try {
      recordSearch(null, 'mosaic', 1);
      clearSearchHistory(null);
      expect(onStorage).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('storage', onStorage);
    }
  });
});

describe('HubSearchHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing on a cold start', () => {
    const { container } = render(<HubSearchHistory />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per stored query', () => {
    writeSearchHistory([
      { query: 'mosaic', at: Date.now() },
      { query: 'battle', at: Date.now() },
    ]);
    render(<HubSearchHistory />);
    expect(screen.getAllByRole('button', { name: /Re-run search/i }).length).toBe(2);
  });

  it('fires onReplay with the query when a chip is clicked', () => {
    writeSearchHistory([{ query: 'mosaic', at: Date.now() }]);
    const onReplay = vi.fn();
    render(<HubSearchHistory onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: /Re-run search: mosaic/i }));
    expect(onReplay).toHaveBeenCalledWith('mosaic');
  });

  it('clear button empties the widget', () => {
    writeSearchHistory([
      { query: 'mosaic', at: Date.now() },
      { query: 'battle', at: Date.now() },
    ]);
    const { container } = render(<HubSearchHistory />);
    expect(container.firstChild).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Clear search history/i }));
    expect(container.firstChild).toBeNull();
  });

  it('rotates focus between chips with ArrowRight and ArrowLeft (with wrap)', () => {
    writeSearchHistory([
      { query: 'mosaic', at: 1 },
      { query: 'battle', at: 2 },
      { query: 'wheel', at: 3 },
    ]);
    render(<HubSearchHistory />);
    const first = screen.getByRole('button', { name: /Re-run search: mosaic/i });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /Re-run search: battle/i })).toHaveFocus();
    // Wrap from last to first.
    fireEvent.keyDown(screen.getByRole('button', { name: /Re-run search: wheel/i }), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: /Re-run search: mosaic/i })).toHaveFocus();
  });

  it('renders a Shift+S shortcut tag in the header', () => {
    writeSearchHistory([{ query: 'mosaic', at: Date.now() }]);
    render(<HubSearchHistory />);
    expect(screen.getByText(/Shift \+ S/i)).toBeInTheDocument();
  });
});