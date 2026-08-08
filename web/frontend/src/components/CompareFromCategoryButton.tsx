import { Link } from 'react-router-dom';
import { Swords } from 'lucide-react';
import {
  buildCompareFromCategory,
  personaPlaygroundCategories,
} from '../data/personaPlayground';

export interface CompareFromCategoryButtonProps {
  /** Exclude paths (e.g. the daily featured). */
  excludePaths?: readonly string[];
  /** Override the current date (useful for tests). */
  date?: Date;
  /** Label shown on the button. */
  label?: string;
  /** Salt to vary the picked pair. */
  salt?: number;
}

/**
 * Single-CTA that picks 2 distinct tools from the same category
 * (using dayOfYear as a seed so it rotates daily) and links to the
 * compare route with the pair prefilled. Renders nothing when no
 * valid pair exists.
 *
 * Different from <SurpriseButton /> (which excludes the daily
 * featured) and <RandomToolButton /> (which picks 1 tool). This
 * is a "compare two from a category" picker.
 */
export function CompareFromCategoryButton({
  excludePaths = [],
  date = new Date(),
  label = 'Compare two from a category',
  salt = 0,
}: CompareFromCategoryButtonProps) {
  // Walk the categories in order, starting from the salt-offset index,
  // and use the first category that yields a valid pair.
  const start = salt % personaPlaygroundCategories().length;
  const ordered = [
    ...personaPlaygroundCategories().slice(start),
    ...personaPlaygroundCategories().slice(0, start),
  ];
  let pair: readonly [import('../data/personaPlayground').PersonaPlaygroundEntry, import('../data/personaPlayground').PersonaPlaygroundEntry] | null = null;
  for (const cat of ordered) {
    const candidate = buildCompareFromCategory(cat, excludePaths, salt, date);
    if (candidate) {
      pair = candidate;
      break;
    }
  }
  if (!pair) return null;
  const href = `/persona-playground/compare?a=${encodeURIComponent(pair[0].path)}&b=${encodeURIComponent(pair[1].path)}`;
  return (
    <Link to={href} className="ppg-compcat" aria-label={`${label}: ${pair[0].name} vs ${pair[1].name}`}>
      <Swords aria-hidden="true" />
      <span>
        {label}
        <strong>
          {pair[0].name} vs {pair[1].name}
        </strong>
      </span>
    </Link>
  );
}
