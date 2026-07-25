import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Compass, Trash2 } from 'lucide-react';
import {
  readRecentTools,
  clearRecentTools,
  type RecentTool,
} from '../lib/recentTools';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

export interface RecentToolsProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max items to render. Defaults to 6. */
  limit?: number;
}

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

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
 * Widget that surfaces the user's most-recently-visited persona tools.
 * Renders nothing on cold start (no recording has happened). Subscribes
 * to the storage event so multiple tabs stay in sync.
 */
export function RecentTools({
  heading = 'Recently visited tools',
  limit = 6,
}: RecentToolsProps) {
  const [items, setItems] = useState<readonly RecentTool[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setItems(readRecentTools(window.localStorage).slice(0, limit));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:recent-tools:v1') {
        setItems(readRecentTools(window.localStorage).slice(0, limit));
      }
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [limit]);

  if (items.length === 0) return null;

  return (
    <section className="ppg-recent-tools" aria-label={heading}>
      <header className="ppg-recent-tools__head">
        <p className="ppg-recent-tools__eyebrow">
          <Compass aria-hidden="true" /> {heading}
        </p>
        <button
          type="button"
          className="ppg-recent-tools__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearRecentTools(window.localStorage);
            setItems([]);
          }}
          aria-label="Clear recently visited tools"
        >
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-recent-tools__list">
        {items.map((item) => {
          const tool = TOOL_BY_PATH.get(item.path);
          if (!tool) return null;
          return (
            <li key={item.path} className="ppg-recent-tools__item">
              <Link to={item.path} className="ppg-recent-tools__link">
                <span className="ppg-recent-tools__row">
                  <span className="ppg-recent-tools__name">{tool.name}</span>
                  <span className="ppg-recent-tools__time">
                    <Clock aria-hidden="true" />
                    {formatRelative(item.at, now)}
                  </span>
                </span>
                <span className="ppg-recent-tools__tagline">{tool.tagline}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
