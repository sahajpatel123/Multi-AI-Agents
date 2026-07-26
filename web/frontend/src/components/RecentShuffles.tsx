import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shuffle, X } from 'lucide-react';
import {
  RECENT_SHUFFLES_KEY,
  clearRecentShuffles,
  readRecentShuffles,
  type RecentShuffle,
} from '../lib/recentShuffles';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

export interface RecentShufflesProps {
  /** Max items to render. Defaults to 5. */
  limit?: number;
}

/**
 * Compact chip strip that surfaces the 5 most recent random picks
 * (Record from the RandomToolButton, Shift+R shortcut, or
 * Reshuffle button). Hidden when no recording has happened yet.
 *
 * It is intentionally different from <RecentTools /> (which
 * captures every persona-tool visit) — this widget only lists
 * tools the user discovered *via the random picker*, so the
 * chip strip answers "what did the shuffle turn up lately?"
 * without re-showing tools the user navigated to manually.
 *
 * Subscribes to the storage event so multiple tabs stay in sync.
 */
export function RecentShuffles({ limit = 5 }: RecentShufflesProps) {
  const [items, setItems] = useState<readonly RecentShuffle[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(readRecentShuffles(window.localStorage).slice(0, limit));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === RECENT_SHUFFLES_KEY) {
        setItems(readRecentShuffles(window.localStorage).slice(0, limit));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [limit]);

  if (items.length === 0) return null;

  return (
    <section
      className="ppg-recent-shuffles"
      aria-label="Recent random picks"
    >
      <header className="ppg-recent-shuffles__head">
        <p className="ppg-recent-shuffles__eyebrow">
          <Shuffle aria-hidden="true" /> Recent reshuffles
        </p>
        <button
          type="button"
          className="ppg-recent-shuffles__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearRecentShuffles(window.localStorage);
            setItems([]);
          }}
          aria-label="Clear recent reshuffles"
        >
          <X aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-recent-shuffles__list">
        {items.map((item) => {
          const tool = PERSONA_PLAYGROUND_ENTRIES.find(
            (e) => e.path === item.path,
          );
          if (!tool) return null;
          return (
            <li key={item.path} className="ppg-recent-shuffles__item">
              <Link
                to={tool.path}
                className="ppg-recent-shuffles__chip"
                aria-label={`Re-open recent random pick: ${tool.name}`}
              >
                <span className="ppg-recent-shuffles__chip-name">{tool.name}</span>
                <span className="ppg-recent-shuffles__chip-meta">{tool.format}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default RecentShuffles;