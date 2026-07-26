import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { tryNextTool } from '../data/personaPlayground';
import { readFavorites } from '../lib/favorites';
import { readRecentTools } from '../lib/recentTools';

export interface TryNextButtonProps {
  /** Heading shown above the button. */
  label?: string;
  /** Override the current date (useful for tests). */
  date?: Date;
}

/**
 * Personalized "what should I try next?" picker. Reads the user's
 * favorited + recently-visited paths from localStorage, scores
 * each catalog entry by category-experience minus star-bonus,
 * and links to the top pick. Renders nothing if the user has
 * starred everything (no recommendation left) or storage is
 * unavailable.
 */
export function TryNextButton({
  label = 'Try a new tool',
  date = new Date(),
}: TryNextButtonProps) {
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const starred = readFavorites(window.localStorage);
    const recent = readRecentTools(window.localStorage).map((r) => r.path);
    const result = tryNextTool(starred, recent, 0, date);
    setPick(result?.path ?? null);
  }, [date]);

  if (!pick) return null;
  return (
    <Link to={pick} className="ppg-trynext" aria-label={`${label}: ${pick}`}>
      <Compass aria-hidden="true" />
      <span>
        {label}
        <strong>{pick.replace('/persona-', '').replace(/-/g, ' ')}</strong>
      </span>
    </Link>
  );
}
