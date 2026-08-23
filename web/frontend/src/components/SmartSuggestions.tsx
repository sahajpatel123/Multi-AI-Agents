import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import {
  suggestTools,
  listEligibleInCategory,
  type SmartSuggestion,
} from '../lib/smartSuggestions';
import { personaPlaygroundCategoryLabel } from '../data/personaPlayground';

export interface SmartSuggestionsProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max suggestions to render in the collapsed view. Defaults to 2. */
  limit?: number;
}

const STORAGE_KEYS = new Set<string>([
  'arena:persona-playground:favorites:v1',
  'arena:persona-playground:recent-tools:v1',
]);

/**
 * "Based on what you've tried" widget — surfaces 1-2 persona tools
 * in the user's strongest category that they haven't visited or
 * starred yet. Renders nothing on cold start (no favorites, no
 * recent visits) so first-time visitors don't see a meaningless
 * rec card.
 *
 * "Show more" expands to every eligible tool in the same category
 * without re-querying storage.
 */
export function SmartSuggestions({
  heading = 'Based on what you’ve tried',
  limit = 2,
}: SmartSuggestionsProps) {
  const [initial, setInitial] = useState<readonly SmartSuggestion[]>([]);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') {
      setInitial([]);
      return;
    }
    setInitial(suggestTools(window.localStorage, { limit }));
    setExpanded(false);
  }, [limit]);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || STORAGE_KEYS.has(event.key)) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const all = useMemo(() => {
    if (initial.length === 0) return [];
    if (typeof window === 'undefined') return [];
    return listEligibleInCategory(
      window.localStorage,
      initial[0].category,
      initial[0].affinity,
    );
  }, [initial]);

  const visible = expanded ? all : initial;

  if (visible.length === 0) return null;

  const reasonText = `Your strongest category is ${personaPlaygroundCategoryLabel(initial[0].category)} (${initial[0].affinity} affinity).`;

  return (
    <section className="ppg-suggest" aria-label={heading}>
      <header className="ppg-suggest__head">
        <p className="ppg-suggest__eyebrow">
          <Sparkles aria-hidden="true" /> {heading}
        </p>
        <p className="ppg-suggest__sub">
          Tools in your strongest category that you haven't visited yet.{' '}
          <span className="ppg-suggest__reason" title={reasonText}>
            Why?
          </span>
        </p>
      </header>
      <ul className="ppg-suggest__list">
        {visible.map(({ entry, category }) => (
          <li key={entry.path} className="ppg-suggest__item">
            <Link to={entry.path} className="ppg-suggest__chip">
              <span className="ppg-suggest__cat">
                {personaPlaygroundCategoryLabel(category)}
              </span>
              <span className="ppg-suggest__name">{entry.name}</span>
              <span className="ppg-suggest__tagline">{entry.tagline}</span>
              <ArrowRight aria-hidden="true" className="ppg-suggest__arrow" />
            </Link>
          </li>
        ))}
      </ul>
      {all.length > initial.length && (
        <button
          type="button"
          className="ppg-suggest__more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer' : `Show all ${all.length}`}
          <ChevronDown
            aria-hidden="true"
            width={14}
            height={14}
            className={`ppg-suggest__more-icon${expanded ? ' ppg-suggest__more-icon--up' : ''}`}
          />
        </button>
      )}
    </section>
  );
}

export default SmartSuggestions;
