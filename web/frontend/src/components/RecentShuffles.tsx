import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shuffle, X } from 'lucide-react';
import {
  RECENT_SHUFFLES_KEY,
  clearRecentShuffles,
  readRecentShuffles,
  type RecentShuffle,
} from '../lib/recentShuffles';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';
import { prefersReducedMotion } from '../lib/motion';

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
  const [announcement, setAnnouncement] = useState('');
  const [entered, setEntered] = useState(false);
  const firstItemRef = useRef<HTMLLIElement | null>(null);
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      setItems(readRecentShuffles(window.localStorage).slice(0, limit));
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === RECENT_SHUFFLES_KEY) {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [limit]);

  // Entrance animation: the strip fades + slides in once per
  // cold-start (first reference to the strip with content). Same
  // 'skip the animation when the user prefers reduced motion' guard
  // used elsewhere on the playground (cycle 471 et al).
  useEffect(() => {
    if (items.length === 0 || entered) return;
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setEntered(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, [items.length, entered]);

  // Announce when a brand-new chip lands at the head of the list
  // (i.e. the user just pressed Reshuffle / Shift+R). We compare
  // the current head's path to the previous render's head — if
  // they differ, the strip got a fresh entry the user might want
  // to know about.
  const prevHeadRef = useRef<string | null>(null);
  useEffect(() => {
    const head = items[0]?.path ?? null;
    if (head && head !== prevHeadRef.current) {
      const tool = PERSONA_PLAYGROUND_ENTRIES.find((e) => e.path === head);
      if (tool && prevHeadRef.current !== null) {
        setAnnouncement(`New random pick added: ${tool.name}`);
      }
    }
    prevHeadRef.current = head;
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section
      className={`ppg-recent-shuffles${entered ? ' ppg-recent-shuffles--enter' : ''}${
        reduceMotion ? ' ppg-recent-shuffles--static' : ''
      }`}
      aria-label="Recent random picks"
    >
      <div
        className="ppg-recent-shuffles__sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
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
            setAnnouncement('Recent reshuffles cleared');
          }}
          aria-label="Clear recent reshuffles"
        >
          <X aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-recent-shuffles__list">
        {items.map((item, index) => {
          const tool = PERSONA_PLAYGROUND_ENTRIES.find(
            (e) => e.path === item.path,
          );
          if (!tool) return null;
          const isLatest = index === 0;
          return (
            <li
              key={item.path}
              className="ppg-recent-shuffles__item"
              ref={isLatest ? firstItemRef : null}
            >
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