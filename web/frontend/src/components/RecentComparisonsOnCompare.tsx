import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trash2 } from 'lucide-react';
import { readRecentComparisons, clearRecentComparisons, type RecentComparison } from '../lib/recentComparisons';
import { findMatchupByPaths } from '../data/personaPlayground';

export interface RecentComparisonsOnCompareProps {
  /** Current pair to exclude (so the user doesn't see the page they're on). */
  currentA?: string | null;
  currentB?: string | null;
  /** Max items to render. Defaults to 3. */
  limit?: number;
}

const TOOL_NAME_BY_PATH = new Map<string, string>([
  ['/persona-council', 'Persona Council'],
  ['/persona-mosaic-council', 'Mosaic Council'],
  ['/persona-battle', 'Persona Battle'],
  ['/persona-mosaic-battle', 'Mosaic Battle'],
  ['/persona-roast', 'Persona Roast'],
  ['/persona-mosaic-roast', 'Mosaic Roast'],
  ['/persona-dilemma', 'Persona Dilemma'],
  ['/persona-dilemma-council', 'Dilemma Council'],
  ['/persona-mosaic-dilemma-council', 'Mosaic Dilemma Council'],
  ['/persona-forecast', 'Persona Forecast'],
  ['/persona-mosaic-forecast', 'Mosaic Forecast'],
  ['/persona-roast-battle', 'Roast Battle'],
  ['/persona-forecast-battle', 'Forecast Battle'],
  ['/persona-mosaic-roasting-battle', 'Mosaic Roasting Battle'],
  ['/persona-roast-battle-council', 'Roast Battle Council'],
  ['/persona-dilemma-forecast', 'Dilemma Forecast'],
  ['/persona-mosaic-dilemma-forecast', 'Mosaic Dilemma Forecast'],
]);

function buildHref(entry: RecentComparison): string {
  return `/persona-playground/compare?a=${encodeURIComponent(entry.a)}&b=${encodeURIComponent(entry.b)}`;
}

function describePair(entry: RecentComparison): string {
  const matchup = findMatchupByPaths(entry.a, entry.b);
  if (matchup) return matchup.title;
  const a = TOOL_NAME_BY_PATH.get(entry.a) ?? entry.a;
  const b = TOOL_NAME_BY_PATH.get(entry.b) ?? entry.b;
  return `${a} vs ${b}`;
}

/**
 * Compact "your recent comparisons" widget that sits on the
 * compare page. Renders nothing on cold start (no comparisons
 * yet). Excludes the current pair so the user doesn't see the
 * page they're already on.
 */
export function RecentComparisonsOnCompare({
  currentA = null,
  currentB = null,
  limit = 3,
}: RecentComparisonsOnCompareProps) {
  const [items, setItems] = useState<readonly RecentComparison[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setItems(readRecentComparisons(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:recent-comparisons:v1') {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const visible = items
    .filter((entry) => !(entry.a === currentA && entry.b === currentB))
    .slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <section className="pcmp-recent" aria-label="Your recent comparisons">
      <header className="pcmp-recent__head">
        <p className="pcmp-recent__eyebrow">
          <History aria-hidden="true" /> Your recent comparisons
        </p>
        <button
          type="button"
          className="pcmp-recent__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearRecentComparisons(window.localStorage);
            setItems([]);
          }}
          aria-label="Clear recent comparisons"
        >
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="pcmp-recent__list">
        {visible.map((entry) => (
          <li key={`${entry.a}|${entry.b}`} className="pcmp-recent__item">
            <Link to={buildHref(entry)} className="pcmp-recent__link">
              <span className="pcmp-recent__pair">{describePair(entry)}</span>
              <span className="pcmp-recent__time">{new Date(entry.at).toLocaleDateString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
