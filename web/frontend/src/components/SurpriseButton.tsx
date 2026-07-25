import { Link } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  pickFeaturedOfDay,
  pickSurpriseTool,
} from '../data/personaPlayground';

export interface SurpriseButtonProps {
  /** Heading shown next to the button. Defaults to "Try a different tool". */
  label?: string;
  /** Override the current date (useful for tests). */
  date?: Date;
}

/**
 * A single-CTA that picks a non-featured catalog tool for today and
 * links to it. Renders nothing when the catalog is empty or when the
 * surprise pick resolves to null.
 */
export function SurpriseButton({
  label = 'Try a different tool',
  date = new Date(),
}: SurpriseButtonProps) {
  const featured = pickFeaturedOfDay(date);
  const surprise = pickSurpriseTool(date, featured?.path ?? null);
  if (!surprise) return null;
  return (
    <Link
      to={surprise.path}
      className="ppg-surprise"
      aria-label={`${label}: ${surprise.name}`}
    >
      <Shuffle aria-hidden="true" />
      <span>
        {label}
        <strong>{surprise.name}</strong>
      </span>
    </Link>
  );
}

// Exported for tests that need the catalog length without re-importing.
export const SURPRISE_CATALOG_SIZE = PERSONA_PLAYGROUND_ENTRIES.length;