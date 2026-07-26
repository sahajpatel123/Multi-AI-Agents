import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { suggestTools, type SmartSuggestion } from '../lib/smartSuggestions';
import { personaPlaygroundCategoryLabel } from '../data/personaPlayground';

export interface SmartSuggestionsProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max suggestions to render. Defaults to 2. */
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
 */
export function SmartSuggestions({
  heading = 'Based on what you’ve tried',
  limit = 2,
}: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<readonly SmartSuggestion[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') {
      setSuggestions([]);
      return;
    }
    setSuggestions(suggestTools(window.localStorage, { limit }));
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

  if (suggestions.length === 0) return null;

  return (
    <section className="ppg-suggest" aria-label={heading}>
      <header className="ppg-suggest__head">
        <p className="ppg-suggest__eyebrow">
          <Sparkles aria-hidden="true" /> {heading}
        </p>
        <p className="ppg-suggest__sub">
          Tools in your strongest category that you haven't visited yet.
        </p>
      </header>
      <ul className="ppg-suggest__list">
        {suggestions.map(({ entry, category }) => (
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
    </section>
  );
}

export default SmartSuggestions;