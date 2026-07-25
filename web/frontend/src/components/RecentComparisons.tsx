import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, History, Trash2 } from 'lucide-react';
import {
  readRecentComparisons,
  clearRecentComparisons,
  type RecentComparison,
} from '../lib/recentComparisons';
import {
  PERSONA_PLAYGROUND_ENTRIES,
} from '../data/personaPlayground';

export interface RecentComparisonsProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max items to render. Defaults to 3. */
  limit?: number;
}

const TOOL_NAME_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e.name] as const),
);

function toolName(path: string): string {
  return TOOL_NAME_BY_PATH.get(path) ?? path.replace('/persona-', '');
}

function formatRelative(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(at).toLocaleDateString();
}

/**
 * Widget that surfaces the user's most-recently-viewed compare pairs.
 * Renders nothing when the list is empty (no recording has happened).
 * Reads localStorage on mount and on the storage event so multiple
 * tabs stay in sync.
 */
export function RecentComparisons({
  heading = 'Recent comparisons',
  limit = 3,
}: RecentComparisonsProps) {
  const [items, setItems] = useState<readonly RecentComparison[]>([]);
  const now = Date.now();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(readRecentComparisons(window.localStorage).slice(0, limit));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:recent-comparisons:v1') {
        setItems(readRecentComparisons(window.localStorage).slice(0, limit));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [limit]);

  if (items.length === 0) return null;

  return (
    <section className="ppg-recent" aria-label={heading}>
      <header className="ppg-recent__head">
        <p className="ppg-recent__eyebrow">
          <History aria-hidden="true" /> {heading}
        </p>
        <button
          type="button"
          className="ppg-recent__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearRecentComparisons(window.localStorage);
            setItems([]);
          }}
          aria-label="Clear recent comparisons"
        >
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-recent__list">
        {items.map((item) => {
          const href = `/persona-playground/compare?a=${encodeURIComponent(item.a)}&b=${encodeURIComponent(item.b)}`;
          return (
            <li key={`${item.a}|${item.b}`} className="ppg-recent__item">
              <Link to={href} className="ppg-recent__link">
                <span className="ppg-recent__pair">
                  <span>{toolName(item.a)}</span>
                  <span className="ppg-recent__vs" aria-hidden="true">
                    vs
                  </span>
                  <span>{toolName(item.b)}</span>
                </span>
                <span className="ppg-recent__time">
                  <Clock aria-hidden="true" />
                  {formatRelative(item.at, now)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
