import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import {
  unvisitedTools,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import { readRecentTools, type RecentTool } from '../lib/recentTools';

export interface ToolsNotYetTriedProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Number of suggestions to render. Defaults to 3. */
  count?: number;
}

/**
 * Widget that surfaces tools the user has NOT recently visited.
 * Renders nothing on cold start (no recent tools recorded) so first-time
 * visitors don't see an empty list, and nothing when the user has
 * visited everything in the catalog.
 */
export function ToolsNotYetTried({
  heading = "Tools you haven't tried",
  count = 3,
}: ToolsNotYetTriedProps) {
  const [recent, setRecent] = useState<readonly RecentTool[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRecent(readRecentTools(window.localStorage));
  }, []);

  const visible = unvisitedTools(
    recent.map((r) => r.path),
    count,
  );

  if (visible.length === 0) return null;

  return (
    <section className="ppg-unvisited" aria-label={heading}>
      <header className="ppg-unvisited__head">
        <p className="ppg-unvisited__eyebrow">
          <Compass aria-hidden="true" /> {heading}
        </p>
      </header>
      <ul className="ppg-unvisited__list">
        {visible.map((entry) => (
          <UnvisitedCard key={entry.path} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function UnvisitedCard({ entry }: { entry: PersonaPlaygroundEntry }) {
  return (
    <li className="ppg-unvisited__item">
      <Link to={entry.path} className="ppg-unvisited__link">
        <span className="ppg-unvisited__name">{entry.name}</span>
        <span className="ppg-unvisited__tagline">{entry.tagline}</span>
      </Link>
    </li>
  );
}
