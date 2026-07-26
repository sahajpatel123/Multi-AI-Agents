import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import {
  MOODS,
  type MoodId,
} from '../lib/moodMatcher';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategoryLabel,
} from '../data/personaPlayground';

export interface MoodMatcherProps {
  /** Heading shown above the widget. */
  heading?: string;
}

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

/**
 * "What's your mood?" widget — five chips, each surfaces a
 * recommended tool path + a one-line pitch. Click a chip to lock
 * in the pick; click again or "Try another mood" to clear.
 */
export function MoodMatcher({ heading = "What's your mood?" }: MoodMatcherProps) {
  const [active, setActive] = useState<MoodId | null>(null);

  const pick = useMemo(() => {
    if (!active) return null;
    const mood = MOODS.find((m) => m.id === active);
    if (!mood) return null;
    const tool = TOOL_BY_PATH.get(mood.toolPath);
    return { mood, tool };
  }, [active]);

  return (
    <section className="ppg-mood" aria-label={heading}>
      <header className="ppg-mood__head">
        <p className="ppg-mood__eyebrow">
          <Sparkles aria-hidden="true" /> {heading}
        </p>
        <p className="ppg-mood__sub">
          Pick the one that fits right now. We'll point you at a tool that handles it.
        </p>
      </header>
      <div className="ppg-mood__chips" role="radiogroup" aria-label="Choose a mood">
        {MOODS.map((mood) => {
          const isActive = active === mood.id;
          return (
            <button
              key={mood.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              className={`ppg-mood__chip${isActive ? ' ppg-mood__chip--active' : ''}`}
              onClick={() => setActive(isActive ? null : mood.id)}
            >
              <span className="ppg-mood__chip-label">{mood.label}</span>
              <span className="ppg-mood__chip-desc">{mood.description}</span>
            </button>
          );
        })}
      </div>
      {pick && (
        <div className="ppg-mood__pick" aria-live="polite">
          <div className="ppg-mood__pick-copy">
            <p className="ppg-mood__pick-eyebrow">
              {personaPlaygroundCategoryLabel(pick.mood.category)}
            </p>
            <h3 className="ppg-mood__pick-name">
              {pick.tool?.name ?? pick.mood.toolNameFallback}
            </h3>
            <p className="ppg-mood__pick-pitch">{pick.mood.pitch}</p>
          </div>
          <Link
            to={pick.mood.toolPath}
            className="ppg-mood__pick-link"
          >
            Try it
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      )}
      {pick && (
        <button
          type="button"
          className="ppg-mood__reset"
          onClick={() => setActive(null)}
        >
          Try another mood
        </button>
      )}
    </section>
  );
}

export default MoodMatcher;