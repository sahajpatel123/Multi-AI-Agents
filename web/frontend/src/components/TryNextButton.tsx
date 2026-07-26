import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  tryNextTool,
} from '../data/personaPlayground';
import { readFavorites } from '../lib/favorites';
import { readRecentTools } from '../lib/recentTools';

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

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

  const tool = useMemo(() => (pick ? TOOL_BY_PATH.get(pick) : null), [pick]);

  if (!pick || !tool) return null;
  return (
    <Link to={pick} className="ppg-trynext" aria-label={`${label}: ${tool.name}`}>
      <Compass aria-hidden="true" />
      <span>
        {label}
        <strong>{tool.name}</strong>
      </span>
    </Link>
  );
}
