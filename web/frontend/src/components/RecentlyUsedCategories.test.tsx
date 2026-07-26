import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecentlyUsedCategories } from './RecentlyUsedCategories';
import {
  readRecentCategories,
  recordRecentCategory,
  clearRecentCategories,
  isValidCategoryId,
  RECENT_CATEGORIES_LIMIT,
} from '../lib/recentCategories';

function writeRecentCategories(values: string[]) {
  window.localStorage.setItem(
    'arena:persona-playground:recent-categories:v1',
    JSON.stringify(values),
  );
}

describe('recentCategories (pure helpers)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns [] for missing storage', () => {
    expect(readRecentCategories(null)).toEqual([]);
  });

  it('isValidCategoryId narrows correctly', () => {
    expect(isValidCategoryId('decide')).toBe(true);
    expect(isValidCategoryId('not-a-cat')).toBe(false);
    expect(isValidCategoryId(42)).toBe(false);
  });

  it('filters out unknown categories on read', () => {
    writeRecentCategories(['decide', 'zzz', 'forecast']);
    expect(readRecentCategories(window.localStorage)).toEqual(['decide', 'forecast']);
  });

  it('dedupes by id keeping the latest', () => {
    writeRecentCategories(['decide', 'forecast', 'decide']);
    expect(readRecentCategories(window.localStorage)).toEqual(['decide', 'forecast']);
  });

  it('caps history at the limit', () => {
    const ids = ['discover', 'versus', 'council', 'roast', 'decide', 'forecast', 'mosaic'];
    for (const id of ids) recordRecentCategory(window.localStorage, id as never);
    expect(readRecentCategories(window.localStorage).length).toBe(RECENT_CATEGORIES_LIMIT);
  });

  it('recordRecentCategory bumps the entry to the front', () => {
    recordRecentCategory(window.localStorage, 'decide');
    recordRecentCategory(window.localStorage, 'forecast');
    recordRecentCategory(window.localStorage, 'decide');
    expect(readRecentCategories(window.localStorage)).toEqual(['decide', 'forecast']);
  });

  it('clearRecentCategories wipes the key', () => {
    recordRecentCategory(window.localStorage, 'decide');
    clearRecentCategories(window.localStorage);
    expect(readRecentCategories(window.localStorage)).toEqual([]);
  });
});

describe('RecentlyUsedCategories widget', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing on cold start', () => {
    const { container } = render(<RecentlyUsedCategories />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip per stored category', () => {
    writeRecentCategories(['decide', 'forecast']);
    render(<RecentlyUsedCategories />);
    expect(screen.getByRole('button', { name: /Filter to Decide/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filter to Forecast/i })).toBeInTheDocument();
  });

  it('fires onPick with the category when a chip is clicked', () => {
    writeRecentCategories(['decide']);
    const onPick = vi.fn();
    render(<RecentlyUsedCategories onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /Filter to Decide/i }));
    expect(onPick).toHaveBeenCalledWith('decide');
  });

  it('clear button empties the widget', () => {
    writeRecentCategories(['decide', 'forecast']);
    const { container } = render(<RecentlyUsedCategories />);
    expect(container.firstChild).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Clear recent categories/i }));
    expect(container.firstChild).toBeNull();
  });
});