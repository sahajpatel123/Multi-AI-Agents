import { type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  relatedTools,
  relatedToolsDefaultHeading,
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';

const CATEGORY_DOT_COLOR: Record<string, string> = {
  discover: '#8aa3ff',
  versus: '#ff8a8a',
  council: '#c8b9ff',
  roast: '#ffb480',
  decide: '#9be3c2',
  forecast: '#ffd86b',
  mosaic: '#f7a8e0',
};

export interface RelatedToolsProps {
  /** Path of the tool the rail is contextual to. Should be a path in the catalog. */
  path: string;
  /** Heading shown above the rail. Defaults to a category-aware phrase. */
  heading?: string;
  /** Number of suggestions to render. Defaults to 3. */
  limit?: number;
}

/**
 * Compact horizontal rail of related persona tools. Renders nothing when
 * the path is unknown or there are no related entries — callers should let
 * the rail silently disappear rather than block the page.
 */
export function RelatedTools({
  path,
  heading,
  limit = 3,
}: RelatedToolsProps) {
  const items = relatedTools(path, limit);
  if (items.length === 0) return null;
  const resolvedHeading = heading ?? relatedToolsDefaultHeading(path) ?? 'Related tools';
  return (
    <section className="ppg-related" aria-label={resolvedHeading}>
      <h2 className="ppg-related__heading">{resolvedHeading}</h2>
      <ul className="ppg-related__row">
        {items.map((entry) => (
          <RelatedToolCard key={entry.path} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function RelatedToolCard({ entry }: { entry: PersonaPlaygroundEntry }) {
  const dotColor = CATEGORY_DOT_COLOR[entry.category] ?? 'var(--ppg-accent-dim)';
  return (
    <li
      className="ppg-related__card"
      style={{ '--ppg-related-dot': dotColor } as CSSProperties}
    >
      <p className="ppg-related__tag">{personaPlaygroundCategoryLabel(entry.category)}</p>
      <h3 className="ppg-related__name">{entry.name}</h3>
      <p className="ppg-related__tagline">{entry.tagline}</p>
      <Link to={entry.path} className="ppg-related__link">
        Try it
        <ArrowRight aria-hidden="true" />
      </Link>
    </li>
  );
}
