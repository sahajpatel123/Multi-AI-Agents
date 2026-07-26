import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Compass, Sparkles } from 'lucide-react';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  PERSONA_PATH_PREFIX,
} from '../data/personaPlayground';
import { readFavoriteEntries } from '../lib/favorites';
import { readRecentTools } from '../lib/recentTools';

export interface ProgressStripProps {
  /** Heading label rendered above the strip. */
  heading?: string;
  /** Optional click handler for the "Tried" card. */
  onJumpTried?: () => void;
  /** Optional click handler for the "Favorited" card. */
  onJumpFavorited?: () => void;
  /** Optional click handler for the "Left" card. */
  onJumpLeft?: () => void;
}

const STORAGE_KEYS = new Set<string>([
  'arena:persona-playground:favorites:v1',
  'arena:persona-playground:recent-tools:v1',
]);

function uniqueValidPaths(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || !value.startsWith(PERSONA_PATH_PREFIX)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Persistent "Your playground progress" strip — surfaces three
 * counts derived from localStorage: how many tools the user has
 * tried (recentTools), how many they've favorited, and how many are
 * still untouched. Includes a progress bar of tried/total so the
 * coverage gap is visible at a glance.
 *
 * Renders nothing on cold start (no visits, no favorites) to avoid
 * cluttering the hub before the user has done anything.
 */
export function ProgressStrip({
  heading = 'Your playground progress',
  onJumpTried,
  onJumpFavorited,
  onJumpLeft,
}: ProgressStripProps) {
  const [triedCount, setTriedCount] = useState(0);
  const [favoritedCount, setFavoritedCount] = useState(0);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') {
      setTriedCount(0);
      setFavoritedCount(0);
      return;
    }
    const recent = uniqueValidPaths(
      readRecentTools(window.localStorage).map((r) => r.path),
    );
    const favorites = uniqueValidPaths(
      readFavoriteEntries(window.localStorage).map((f) => f.path),
    );
    const tried = uniqueValidPaths([...recent, ...favorites]);
    setTriedCount(tried.length);
    setFavoritedCount(favorites.length);
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || STORAGE_KEYS.has(event.key)) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const total = PERSONA_PLAYGROUND_ENTRIES.length;
  const left = Math.max(0, total - triedCount);
  const coverage = total > 0 ? Math.round((triedCount / total) * 100) : 0;
  const message = useMemo(() => {
    if (triedCount === 0 && favoritedCount === 0) return null;
    if (triedCount === 0) return 'Pick a featured tool to start your collection.';
    if (coverage >= 80) return "You've explored most of the playground — nicely done.";
    if (coverage >= 50) return 'Halfway there. The mosaic tools are still wide open.';
    if (coverage >= 20) return 'A solid start. Try a forecast tool next.';
    return 'Just getting started. Cmd/Ctrl-K jumps to any tool.';
  }, [triedCount, favoritedCount, coverage]);

  if (triedCount === 0 && favoritedCount === 0) return null;

  return (
    <section className="ppg-progress" aria-label={heading}>
      <header className="ppg-progress__head">
        <p className="ppg-progress__eyebrow">
          <Sparkles aria-hidden="true" /> {heading}
        </p>
      </header>
      <div className="ppg-progress__cards">
        <button
          type="button"
          className="ppg-progress__card ppg-progress__card--tried"
          onClick={onJumpTried}
          aria-label={`${triedCount} tools tried out of ${total}`}
        >
          <span className="ppg-progress__icon" aria-hidden>
            <Compass width={16} height={16} strokeWidth={1.75} />
          </span>
          <span className="ppg-progress__num">{triedCount}</span>
          <span className="ppg-progress__label">Tried</span>
          <span className="ppg-progress__sub">of {total}</span>
        </button>
        <button
          type="button"
          className="ppg-progress__card ppg-progress__card--fav"
          onClick={onJumpFavorited}
          aria-label={`${favoritedCount} tools favorited`}
        >
          <span className="ppg-progress__icon" aria-hidden>
            <Bookmark width={16} height={16} strokeWidth={1.75} />
          </span>
          <span className="ppg-progress__num">{favoritedCount}</span>
          <span className="ppg-progress__label">Favorited</span>
          <span className="ppg-progress__sub">starred</span>
        </button>
        <button
          type="button"
          className="ppg-progress__card ppg-progress__card--left"
          onClick={onJumpLeft}
          aria-label={`${left} tools not yet tried`}
        >
          <span className="ppg-progress__icon" aria-hidden>
            <Sparkles width={16} height={16} strokeWidth={1.75} />
          </span>
          <span className="ppg-progress__num">{left}</span>
          <span className="ppg-progress__label">Untried</span>
          <span className="ppg-progress__sub">to explore</span>
        </button>
      </div>
      <div
        className="ppg-progress__bar"
        role="progressbar"
        aria-valuenow={coverage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${coverage}% of the playground explored`}
      >
        <span
          className="ppg-progress__bar-fill"
          style={{ width: `${coverage}%` }}
        />
      </div>
      {message && <p className="ppg-progress__msg">{message}</p>}
    </section>
  );
}

export default ProgressStrip;