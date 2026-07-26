import { useCallback, useEffect, useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import {
  readMoodHistory,
  clearMoodHistory,
  type MoodHistoryEntry,
} from '../lib/moodHistory';
import { MOODS, type MoodId } from '../lib/moodMatcher';

export interface MoodMatcherHistoryProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Optional callback when the user re-picks a recent mood. */
  onReplay?: (id: MoodId) => void;
}

const MOOD_BY_ID: Readonly<Record<MoodId, (typeof MOODS)[number]>> = MOODS.reduce(
  (acc, mood) => {
    acc[mood.id] = mood;
    return acc;
  },
  {} as Record<MoodId, (typeof MOODS)[number]>,
);

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

/**
 * "Your recent moods" widget — surfaces the last few moods the
 * user picked so they can re-jump to a previous recommendation in
 * 1 click. Subscribes to the storage event for cross-tab sync.
 * Renders nothing on cold start (no picks yet).
 */
export function MoodMatcherHistory({
  heading = 'Your recent moods',
  onReplay,
}: MoodMatcherHistoryProps) {
  const [entries, setEntries] = useState<readonly MoodHistoryEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setEntries(readMoodHistory(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:mood-history:v1') {
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

  if (entries.length === 0) return null;

  return (
    <section className="ppg-moodhist" aria-label={heading}>
      <header className="ppg-moodhist__head">
        <p className="ppg-moodhist__eyebrow">
          <Clock aria-hidden="true" /> {heading}
        </p>
        <div className="ppg-moodhist__head-meta">
          <span className="ppg-moodhist__count" aria-label={`${entries.length} recent moods`}>
            {entries.length}
          </span>
          <button
            type="button"
            className="ppg-moodhist__clear"
            onClick={() => {
              if (typeof window === 'undefined') return;
              clearMoodHistory(window.localStorage);
              setEntries([]);
            }}
            aria-label="Clear mood history"
          >
            <Trash2 aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </header>
      <ul className="ppg-moodhist__list">
        {entries.map((entry) => {
          const mood = MOOD_BY_ID[entry.id];
          if (!mood) return null;
          return (
            <li key={entry.id} className="ppg-moodhist__item">
              <button
                type="button"
                className="ppg-moodhist__chip"
                onClick={() => onReplay?.(entry.id)}
                aria-label={`Replay ${mood.label} mood`}
              >
                <span className="ppg-moodhist__chip-label">{mood.label}</span>
                <span className="ppg-moodhist__chip-time">
                  {formatRelative(entry.at, now)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default MoodMatcherHistory;