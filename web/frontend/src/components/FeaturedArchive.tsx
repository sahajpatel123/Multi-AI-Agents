import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Sparkles } from 'lucide-react';
import {
  readFeaturedArchive,
  type FeaturedArchiveEntry,
} from '../lib/featuredArchive';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

export interface FeaturedArchiveProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max items to render. Defaults to 7. */
  limit?: number;
  /** Override the current date (useful for tests). */
  today?: Date;
}

function isoToLocalDate(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isoToDayKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format an archive date relative to today. Returns 'Today',
 * 'Yesterday', 'Nd ago' (for &lt; 7 days), or a short absolute
 * date. Pure: takes a YYYY-MM-DD string + a today Date so tests
 * can drive the time without mutating the system clock.
 */
export function formatRelativeArchiveDate(iso: string, today: Date = new Date()): string {
  const date = isoToLocalDate(iso);
  if (!date) return iso;
  const todayKey = isoToDayKey(today);
  if (iso === todayKey) return 'Today';
  // Compute day diff in local time.
  const aMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const bMidnight = date.getTime();
  const dayDiff = Math.round((aMidnight - bMidnight) / 86_400_000);
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Widget that surfaces the last N daily featured picks. Renders
 * nothing on cold start (no archive recorded) so first-time
 * visitors don't see an empty list. Subscribes to the storage
 * event for cross-tab sync.
 */
export function FeaturedArchive({
  heading = 'Past featured picks',
  limit = 7,
  today = new Date(),
}: FeaturedArchiveProps) {
  const [items, setItems] = useState<readonly FeaturedArchiveEntry[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(readFeaturedArchive(window.localStorage).slice(0, limit));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:featured-archive:v1') {
        setItems(readFeaturedArchive(window.localStorage).slice(0, limit));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [limit]);

  const todayKey = useMemo(() => isoToDayKey(today), [today]);

  if (items.length === 0) return null;

  return (
    <section className="ppg-archive" aria-label={heading}>
      <header className="ppg-archive__head">
        <p className="ppg-archive__eyebrow">
          <Calendar aria-hidden="true" /> {heading}
        </p>
      </header>
      <ul className="ppg-archive__list">
        {items.map((item) => {
          const tool = TOOL_BY_PATH.get(item.path);
          const isToday = item.date === todayKey;
          return (
            <li key={item.date} className="ppg-archive__item">
              <Link
                to={item.path}
                className={`ppg-archive__link${isToday ? ' ppg-archive__link--today' : ''}`}
              >
                <span className="ppg-archive__date" aria-label={`Featured on ${item.date}`}>
                  {isToday ? (
                    <span className="ppg-archive__today-pill">
                      <Sparkles aria-hidden="true" />
                      Today
                    </span>
                  ) : (
                    formatRelativeArchiveDate(item.date, today)
                  )}
                </span>
                <span className="ppg-archive__name">{tool?.name ?? item.path}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
