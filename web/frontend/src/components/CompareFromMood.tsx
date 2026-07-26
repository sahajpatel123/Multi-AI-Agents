import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, ChevronDown, GitCompare } from 'lucide-react';
import {
  compareAlternativesForMood,
} from '../lib/compareFromMood';
import { MOODS } from '../lib/moodMatcher';

export interface CompareFromMoodProps {
  /** Currently active mood id. */
  moodId: string;
  /** Max alternative tools to surface in the collapsed view. Defaults to 2. */
  limit?: number;
}

const ALL_LIMIT = 6;

/**
 * Mood-driven "or compare against" row. Shown inside the
 * MoodMatcher pick panel after a user picks a mood. Surfaces alt
 * tools in the same category the user could pit against the
 * mood's primary recommendation. Each alt is a direct link to
 * the compare route with the (mood-primary, alt) pair prefilled.
 * A "Swap" button rotates which alt is the primary comparison
 * pair; "Show all N" / "Show fewer" expands to every eligible
 * alt.
 *
 * Renders nothing when the mood has no eligible alts in its
 * category (e.g. single-tool categories).
 */
export function CompareFromMood({ moodId, limit = 2 }: CompareFromMoodProps) {
  const [swapIndex, setSwapIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const all = useMemo(
    () => compareAlternativesForMood(moodId, { limit: ALL_LIMIT }),
    [moodId],
  );
  const visible = expanded ? all : compareAlternativesForMood(moodId, { limit });
  if (all.length === 0) return null;

  const primary = visible[swapIndex % Math.max(visible.length, 1)];
  const url = primary
    ? (() => {
        const mood = MOODS.find((m) => m.id === moodId);
        if (!mood) return null;
        const params = new URLSearchParams({
          a: mood.toolPath,
          b: primary.path,
        });
        return `/persona-playground/compare?${params.toString()}`;
      })()
    : null;
  if (!url) return null;

  return (
    <div className="ppg-mood-compare" role="group" aria-label="Or compare against">
      <p className="ppg-mood-compare__eyebrow">
        <GitCompare aria-hidden="true" /> Or compare against
      </p>
      <ul className="ppg-mood-compare__list">
        {visible.map((alt, idx) => (
          <li key={alt.path} className="ppg-mood-compare__item">
            <Link
              to={
                idx === swapIndex % visible.length
                  ? url
                  : (() => {
                      const mood = MOODS.find((m) => m.id === moodId);
                      if (!mood) return url;
                      return `/persona-playground/compare?${new URLSearchParams({
                        a: mood.toolPath,
                        b: alt.path,
                      }).toString()}`;
                    })()
              }
              className="ppg-mood-compare__chip"
              title={`Compare against ${alt.name}`}
            >
              <span className="ppg-mood-compare__name">{alt.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="ppg-mood-compare__row">
        <Link to={url} className="ppg-mood-compare__cta">
          Compare them
        </Link>
        {visible.length > 1 && (
          <button
            type="button"
            className="ppg-mood-compare__swap"
            onClick={() =>
              setSwapIndex((cur) => (cur + 1) % visible.length)
            }
            aria-label="Swap the comparison partner"
          >
            <ArrowRightLeft aria-hidden="true" width={12} height={12} />
            Swap
          </button>
        )}
      </div>
      {all.length > visible.length && (
        <button
          type="button"
          className="ppg-mood-compare__more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer' : `Show all ${all.length}`}
          <ChevronDown
            aria-hidden="true"
            width={12}
            height={12}
            className={`ppg-mood-compare__more-icon${expanded ? ' ppg-mood-compare__more-icon--up' : ''}`}
          />
        </button>
      )}
    </div>
  );
}

export default CompareFromMood;