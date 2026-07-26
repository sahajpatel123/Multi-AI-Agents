import { Link } from 'react-router-dom';
import { GitCompare } from 'lucide-react';
import {
  compareAlternativesForMood,
  compareUrlForMood,
} from '../lib/compareFromMood';

export interface CompareFromMoodProps {
  /** Currently active mood id. */
  moodId: string;
  /** Max alternative tools to surface. Defaults to 2. */
  limit?: number;
}

/**
 * Mood-driven "or compare against" row. Shown inside the
 * MoodMatcher pick panel after a user picks a mood. Surfaces 1-2
 * alternative tools in the same category the user could pit
 * against the mood's primary recommendation. Each alt is a direct
 * link to the compare route with the pair prefilled; a primary
 * CTA below jumps to the first alt pair.
 *
 * Renders nothing when the mood has no eligible alts in its
 * category (e.g. single-tool categories).
 */
export function CompareFromMood({ moodId, limit = 2 }: CompareFromMoodProps) {
  const alts = compareAlternativesForMood(moodId, { limit });
  const url = compareUrlForMood(moodId, { limit });
  if (!url || alts.length === 0) return null;

  return (
    <div className="ppg-mood-compare" role="group" aria-label="Or compare against">
      <p className="ppg-mood-compare__eyebrow">
        <GitCompare aria-hidden="true" /> Or compare against
      </p>
      <ul className="ppg-mood-compare__list">
        {alts.map((alt) => (
          <li key={alt.path} className="ppg-mood-compare__item">
            <Link
              to={url}
              className="ppg-mood-compare__chip"
              title={`Compare against ${alt.name}`}
            >
              <span className="ppg-mood-compare__name">{alt.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to={url} className="ppg-mood-compare__cta">
        Compare them
      </Link>
    </div>
  );
}

export default CompareFromMood;