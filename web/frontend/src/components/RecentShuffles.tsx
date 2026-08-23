import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pin, PinOff, Shuffle, X } from 'lucide-react';
import {
  RECENT_SHUFFLES_KEY,
  clearRecentShuffles,
  readRecentShuffles,
  type RecentShuffle,
} from '../lib/recentShuffles';
import {
  PINNED_TOOLS_LIMIT,
  isPinned,
  togglePinnedTool,
} from '../lib/pinnedTools';
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
 * Each chip carries a small Pin action — one click promotes a
 * recent reshuffle to a pinned tool (capped at 3, same as the
 * full Pin system). The pin state is reflected in the icon and
 * is kept in sync with the PinnedTools widget via the storage
 * event.
 *
 * Subscribes to the storage event so multiple tabs stay in sync.
 */
export function RecentShuffles({ limit = 5 }: RecentShufflesProps) {
  const [items, setItems] = useState<readonly RecentShuffle[]>([]);
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [entered, setEntered] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  const [pulsePath, setPulsePath] = useState<string | null>(null);
  const [limitFlash, setLimitFlash] = useState(0);
  const firstItemRef = useRef<HTMLLIElement | null>(null);
  const reduceMotion = prefersReducedMotion();
  const PINNED_TOOLS_KEY = 'arena:persona-playground:pinned-tools:v1';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => {
      setItems(readRecentShuffles(window.localStorage).slice(0, limit));
    };
    const refreshPins = () => {
      // Lazy import so we don't pull pinnedTools into the initial
      // chunk for users who never reach the shuffle strip.
      import('../lib/pinnedTools').then(({ readPinnedTools }) => {
        setPinned(readPinnedTools(window.localStorage));
      });
    };
    refresh();
    refreshPins();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) {
        refresh();
        refreshPins();
        return;
      }
      if (event.key === RECENT_SHUFFLES_KEY) refresh();
      if (event.key === PINNED_TOOLS_KEY) refreshPins();
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

  const onPinToggle = (path: string, name: string) => {
    if (typeof window === 'undefined') return;
    const wasPinned = isPinned(window.localStorage, path);
    // togglePinnedTool returns false both when (a) the pin was
    // successfully removed and (b) the cap was hit. Check the
    // pre-state to disambiguate: if wasPinned, the false return
    // means "successfully removed"; if not wasPinned, the false
    // return means "cap was hit".
    const nowPinned = togglePinnedTool(window.localStorage, path);
    if (!nowPinned && !wasPinned) {
      setAnnouncement(`Pin limit reached (${PINNED_TOOLS_LIMIT}). Unpin a tool first.`);
      // Briefly flash the strip red so the user sees that the
      // action was rejected — not silent.
      setLimitFlash((tick) => tick + 1);
      return;
    }
    setAnnouncement(nowPinned ? `Pinned ${name}` : `Unpinned ${name}`);
    // Pulse the affected chip so the user sees the pin state change.
    setPulsePath(path);
    setPulseTick((tick) => tick + 1);
  };

  if (items.length === 0) return null;

  return (
    <section
      className={`ppg-recent-shuffles${entered ? ' ppg-recent-shuffles--enter' : ''}${
        reduceMotion ? ' ppg-recent-shuffles--static' : ''
      }`}
      aria-label="Recent random picks"
      data-limit-flash={limitFlash > 0 ? 'true' : undefined}
      data-limit-flash-tick={limitFlash > 0 ? limitFlash : undefined}
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
          const isPinnedNow = pinned.includes(item.path);
          return (
            <li
              key={item.path}
              className="ppg-recent-shuffles__item"
              ref={isLatest ? firstItemRef : null}
            >
              <Link
                to={tool.path}
                className={`ppg-recent-shuffles__chip${
                  isPinnedNow ? ' ppg-recent-shuffles__chip--pinned' : ''
                }${
                  pulseTick > 0 && pulsePath === item.path
                    ? ' ppg-recent-shuffles__chip--pulse'
                    : ''
                }`}
                aria-label={`Re-open recent random pick: ${tool.name}`}
              >
                <span className="ppg-recent-shuffles__chip-name">{tool.name}</span>
                <span className="ppg-recent-shuffles__chip-meta">{tool.format}</span>
                <button
                  type="button"
                  className="ppg-recent-shuffles__pin"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPinToggle(item.path, tool.name);
                  }}
                  aria-label={
                    isPinnedNow
                      ? `Unpin ${tool.name} from your shortlist`
                      : `Pin ${tool.name} to your shortlist`
                  }
                  aria-pressed={isPinnedNow}
                  title={
                    isPinnedNow
                      ? `Unpin ${tool.name}`
                      : `Pin ${tool.name}`
                  }
                >
                  {isPinnedNow ? (
                    <PinOff aria-hidden="true" width={12} height={12} />
                  ) : (
                    <Pin aria-hidden="true" width={12} height={12} />
                  )}
                </button>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default RecentShuffles;
