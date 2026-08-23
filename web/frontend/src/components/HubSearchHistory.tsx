import { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * Keyboard: ←/→ rotates the focus between chips; the page can
 * call the global Shift+S shortcut to focus the most recent chip.
 */
export function HubSearchHistory({
  heading = 'Recent searches',
  onReplay,
}: HubSearchHistoryProps) {
  const [entries, setEntries] = useState<readonly SearchHistoryEntry[]>([]);
  const [active, setActive] = useState(0);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  useEffect(() => {
    setActive((cur) => Math.min(cur, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  const focusChip = useCallback((query: string) => {
    chipRefs.current[query]?.focus();
  }, []);

  const onChipKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, query: string) => {
      const idx = entries.findIndex((e) => e.query === query);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = idx + 1 < entries.length ? idx + 1 : 0;
        const target = entries[next];
        if (target) {
          focusChip(target.query);
          setActive(next);
        }
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = idx - 1 >= 0 ? idx - 1 : entries.length - 1;
        const target = entries[prev];
        if (target) {
          focusChip(target.query);
          setActive(prev);
        }
        return;
      }
    },
    [entries, focusChip],
  );

  if (entries.length === 0) return null;

  return (
    <section className="ppg-searchhist" aria-label={heading}>
      <header className="ppg-searchhist__head">
        <p className="ppg-searchhist__eyebrow">
          <Clock aria-hidden="true" /> {heading}
          <kbd className="ppg-searchhist__shortcut" aria-hidden="true">
            Shift + S
          </kbd>
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
      <ul className="ppg-searchhist__list" role="list">
        {entries.map((entry, idx) => (
          <li key={entry.query} className="ppg-searchhist__item">
            <button
              type="button"
              ref={(node) => {
                chipRefs.current[entry.query] = node;
              }}
              className="ppg-searchhist__chip"
              tabIndex={active === idx ? 0 : -1}
              onClick={() => onReplay?.(entry.query)}
              onKeyDown={(event) => onChipKeyDown(event, entry.query)}
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
