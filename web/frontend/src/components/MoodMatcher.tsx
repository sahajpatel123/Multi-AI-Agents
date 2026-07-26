import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import {
  MOODS,
  MOOD_IDS,
  isMoodId,
  type MoodId,
} from '../lib/moodMatcher';
import { recordMoodPick } from '../lib/moodHistory';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategoryLabel,
} from '../data/personaPlayground';

export interface MoodMatcherProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** When true, sync the active mood to the `?mood=` URL param. */
  syncUrl?: boolean;
  /** Optional id for deep-link scrolling from sibling widgets. */
  sectionId?: string;
  /** Controlled active mood. When omitted, the widget manages its own state. */
  activeId?: MoodId | null;
  /** Fired whenever the active mood changes (controlled mode). */
  onActiveChange?: (id: MoodId | null) => void;
}

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

function clampMoodIndex(next: number): number {
  if (MOODS.length === 0) return 0;
  return ((next % MOODS.length) + MOODS.length) % MOODS.length;
}

/**
 * "What's your mood?" widget — five chips, each surfaces a
 * recommended tool path + a one-line pitch. Click a chip to lock
 * in the pick; click again or "Try another mood" to clear.
 * Keyboard: ←/→ rotates the radio focus, Enter/Space toggles,
 * Home/End jumps to the ends. When syncUrl is enabled, the active
 * mood is reflected in `?mood=` so the page is shareable.
 */
export function MoodMatcher({
  heading = "What's your mood?",
  syncUrl = false,
  sectionId,
  activeId,
  onActiveChange,
}: MoodMatcherProps) {
  const [params, setParams] = useSearchParams();
  const isControlled = activeId !== undefined;
  const [internalActive, setInternalActive] = useState<MoodId | null>(() => {
    if (!syncUrl) return null;
    const fromUrl = params.get('mood');
    return isMoodId(fromUrl) ? fromUrl : null;
  });
  const active = isControlled ? (activeId ?? null) : internalActive;
  const setActive = useCallback(
    (next: MoodId | null) => {
      if (!isControlled) setInternalActive(next);
      onActiveChange?.(next);
    },
    [isControlled, onActiveChange],
  );
  const chipRefs = useRef<Record<MoodId, HTMLButtonElement | null>>(
    {} as Record<MoodId, HTMLButtonElement | null>,
  );

  // Sync active → URL when enabled.
  useEffect(() => {
    if (!syncUrl) return;
    const next = new URLSearchParams(params);
    if (active) next.set('mood', active);
    else next.delete('mood');
    // Skip the write if nothing actually changed.
    if (next.get('mood') === params.get('mood')) return;
    setParams(next, { replace: true });
  }, [active, syncUrl, params, setParams]);

  const pick = useMemo(() => {
    if (!active) return null;
    const mood = MOODS.find((m) => m.id === active);
    if (!mood) return null;
    const tool = TOOL_BY_PATH.get(mood.toolPath);
    return { mood, tool };
  }, [active]);

  // Record the pick for the history widget whenever `active` flips
  // to a new mood. The history lib is silent on storage failures.
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    recordMoodPick(window.localStorage, active);
  }, [active]);

  const focusMood = useCallback((id: MoodId) => {
    chipRefs.current[id]?.focus();
  }, []);

  const onChipKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: MoodId) => {
      const idx = MOOD_IDS.indexOf(id);
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = clampMoodIndex(idx + 1);
        focusMood(MOOD_IDS[next]);
        setActive(MOOD_IDS[next]);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = clampMoodIndex(idx - 1);
        focusMood(MOOD_IDS[prev]);
        setActive(MOOD_IDS[prev]);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        focusMood(MOOD_IDS[0]);
        setActive(MOOD_IDS[0]);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        const last = MOODS.length - 1;
        focusMood(MOOD_IDS[last]);
        setActive(MOOD_IDS[last]);
        return;
      }
    },
    [focusMood, setActive],
  );

  return (
    <section className="ppg-mood" aria-label={heading} id={sectionId}>
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
              ref={(node) => {
                chipRefs.current[mood.id] = node;
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={active === null || isActive ? 0 : -1}
              className={`ppg-mood__chip${isActive ? ' ppg-mood__chip--active' : ''}`}
              onClick={() => setActive(isActive ? null : mood.id)}
              onKeyDown={(event) => onChipKeyDown(event, mood.id)}
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