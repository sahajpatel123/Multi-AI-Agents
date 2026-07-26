import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Trash2 } from 'lucide-react';
import {
  readFavoriteEntries,
  clearFavorites,
  type FavoriteEntry,
} from '../lib/favorites';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

export interface RecentlyFavoritedProps {
  /** Heading shown above the widget. */
  heading?: string;
}

function formatRelative(at: number, now: number): string {
  if (!at) return 'recently';
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

function sortByRecency(entries: readonly FavoriteEntry[]): FavoriteEntry[] {
  return [...entries].sort((a, b) => b.at - a.at);
}

/**
 * "When did I star each tool?" widget for the favorites page.
 * Sorts favorites by recency, shows the tool name + relative
 * timestamp. Renders nothing on cold start.
 */
export function RecentlyFavorited({ heading = 'Recently starred' }: RecentlyFavoritedProps) {
  const [entries, setEntries] = useState<readonly FavoriteEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setEntries(readFavoriteEntries(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:favorites:v1') {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const visible = useMemo(
    () =>
      sortByRecency(entries)
        .map((entry) => ({ entry, tool: TOOL_BY_PATH.get(entry.path) }))
        .filter((pair): pair is { entry: FavoriteEntry; tool: NonNullable<typeof pair.tool> } =>
          Boolean(pair.tool),
        ),
    [entries],
  );

  if (visible.length === 0) return null;

  return (
    <section className="ppg-recfav" aria-label={heading}>
      <header className="ppg-recfav__head">
        <p className="ppg-recfav__eyebrow">
          <Star aria-hidden="true" /> {heading}
        </p>
        <div className="ppg-recfav__head-meta">
          <span
            className="ppg-recfav__count"
            aria-label={`${visible.length} starred tools`}
          >
            {visible.length} starred
          </span>
          <button
            type="button"
            className="ppg-recfav__clear"
            onClick={() => {
              if (typeof window === 'undefined') return;
              clearFavorites(window.localStorage);
              setEntries([]);
            }}
            aria-label="Clear all favorites"
          >
            <Trash2 aria-hidden="true" />
            <span>Clear all</span>
          </button>
        </div>
      </header>
      <ul className="ppg-recfav__list">
        {visible.map(({ entry, tool }) => (
          <li key={entry.path} className="ppg-recfav__item">
            <Link to={entry.path} className="ppg-recfav__link">
              <span className="ppg-recfav__name">{tool.name}</span>
              <span className="ppg-recfav__format">{tool.format}</span>
              <span className="ppg-recfav__time">
                <Star aria-hidden="true" fill="currentColor" strokeWidth={1.6} />
                {formatRelative(entry.at, now)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
