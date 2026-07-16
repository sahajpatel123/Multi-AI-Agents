import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_DOMAIN_ALL,
  collectWatchlistDomainOptions,
  filterWatchlistByDomain,
  watchlistDomainFilterUseful,
  watchlistDomainLabel,
} from './watchlistDomainFilter';

describe('watchlistDomainFilter', () => {
  const items = [
    { id: 'a', expertise_domain: 'Rates' },
    { id: 'b', expertise_domain: 'rates' },
    { id: 'c', expertise_domain: 'Housing' },
    { id: 'd', expertise_domain: '' },
  ];

  it('collects All domains plus unique domains by frequency', () => {
    const opts = collectWatchlistDomainOptions(items);
    expect(opts[0]).toEqual({ value: WATCHLIST_DOMAIN_ALL, label: 'All domains' });
    expect(opts.slice(1).map((o) => o.value)).toEqual(['rates', 'housing']);
    expect(opts[1].label).toBe('Rates');
  });

  it('filters by domain case-insensitively', () => {
    expect(filterWatchlistByDomain(items, WATCHLIST_DOMAIN_ALL)).toHaveLength(4);
    expect(filterWatchlistByDomain(items, 'rates').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('detects usefulness and labels', () => {
    expect(watchlistDomainFilterUseful(items)).toBe(true);
    expect(watchlistDomainFilterUseful([{ expertise_domain: 'Rates' }])).toBe(false);
    const opts = collectWatchlistDomainOptions(items);
    expect(watchlistDomainLabel('housing', opts)).toBe('Housing');
  });
});
