import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  relatedTools,
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';

export interface RelatedToolsProps {
  /** Path of the tool the rail is contextual to. Should be a path in the catalog. */
  path: string;
  /** Heading shown above the rail. Defaults to "You might also like". */
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
  heading = 'You might also like',
  limit = 3,
}: RelatedToolsProps) {
  const items = relatedTools(path, limit);
  if (items.length === 0) return null;
  return (
    <section className="ppg-related" aria-label={heading}>
      <h2 className="ppg-related__heading">{heading}</h2>
      <ul className="ppg-related__row">
        {items.map((entry) => (
          <RelatedToolCard key={entry.path} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function RelatedToolCard({ entry }: { entry: PersonaPlaygroundEntry }) {
  return (
    <li className="ppg-related__card">
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
