import { Link } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import { pickRandomTool } from '../data/personaPlayground';

export interface RandomToolButtonProps {
  /** Paths to exclude from the random pick (e.g. the daily featured, the surprise pick). */
  excludePaths?: readonly string[];
  /** Override the current date (useful for tests). */
  date?: Date;
  /** Label shown on the button. Defaults to "Open a random tool". */
  label?: string;
  /** Visual size. Defaults to "sm". */
  size?: 'sm' | 'md';
}

/**
 * Single-CTA that picks a random tool from the catalog (excluding
 * the given paths) and links to it. Renders nothing when the
 * catalog is empty or the only entry is excluded.
 *
 * Different from <SurpriseButton /> (which excludes the daily
 * featured) and <FeaturedArchive /> (which shows past featured
 * picks). This is the "shuffle me" generic picker.
 */
export function RandomToolButton({
  excludePaths = [],
  date = new Date(),
  label = 'Open a random tool',
  size = 'sm',
}: RandomToolButtonProps) {
  const pick = pickRandomTool(excludePaths, 0, date);
  if (!pick) return null;
  const sizeClass = size === 'md' ? 'ppg-randombtn--md' : 'ppg-randombtn--sm';
  return (
    <Link
      to={pick.path}
      className={`ppg-randombtn ${sizeClass}`}
      aria-label={`${label}: ${pick.name}`}
    >
      <Shuffle aria-hidden="true" />
      <span>
        {label}
        <strong>{pick.name}</strong>
      </span>
    </Link>
  );
}
