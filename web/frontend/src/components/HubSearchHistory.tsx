import { useCallback, useEffect, useState } from 'react';
import { Clock, Search, Trash2 } from 'lucide-react';
import {
  readSearchHistory,
  clearSearchHistory,
  type SearchHistoryEntry,
} from '../lib/hubSearchHistory';

export interface HubSearchHistoryProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Callback fired when the user re-runs a previous query. */
  onReplay?: (query: string) => void;
}

const STORAGE_KEY = 'arena:persona-playground:search-history:v1';

/**
 * "Recent searches" widget — surfaces the last 5 queries the user
 * typed into the hub search box. Renders nothing on cold start (no
 * prior queries) so first-time visitors don't see a meaningless
 * empty chip strip. Subscribes to the storage event for cross-tab
 * sync.
 */
export function HubSearchHistory({
  heading = 'Recent searches',
  onReplay,
}: HubSearchHistoryProps) {
  const [entries, setEntries] = useState<readonly SearchHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setEntries(readSearchHistory(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  if (entries.length === 0) return null;

  return (
    <section className="ppg-searchhist" aria-label={heading}>
      <header className="ppg-searchhist__head">
        <p className="ppg-searchhist__eyebrow">
          <Clock aria-hidden="true" /> {heading}
        </p>
        <button
          type="button"
          className="ppg-searchhist__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearSearchHistory(window.localStorage);
            setEntries([]);
          }}
          aria-label="Clear search history"
        >
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-searchhist__list">
        {entries.map((entry) => (
          <li key={entry.query} className="ppg-searchhist__item">
            <button
              type="button"
              className="ppg-searchhist__chip"
              onClick={() => onReplay?.(entry.query)}
              aria-label={`Re-run search: ${entry.query}`}
            >
              <Search aria-hidden="true" className="ppg-searchhist__icon" />
              <span className="ppg-searchhist__query">{entry.query}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HubSearchHistory;