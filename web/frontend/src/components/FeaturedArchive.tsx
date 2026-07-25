import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
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
}

function formatDate(iso: string): string {
  // Parse as a local date so we don't shift across timezones.
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
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
          return (
            <li key={item.date} className="ppg-archive__item">
              <Link to={item.path} className="ppg-archive__link">
                <span className="ppg-archive__date" aria-label={`Featured on ${item.date}`}>
                  {formatDate(item.date)}
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
