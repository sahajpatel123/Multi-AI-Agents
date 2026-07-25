import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, Trash2 } from 'lucide-react';
import { readFavorites, clearFavorites, toggleFavorite } from '../lib/favorites';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

export interface FavoritesProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Max items to render. Defaults to 6. */
  limit?: number;
}

/**
 * Widget that surfaces the user's favorited persona tools. Renders
 * nothing on cold start (no favorites). Each row: tool name + link
 * + a small "Unstar" button. Subscribes to the storage event so
 * multiple tabs stay in sync.
 */
export function Favorites({
  heading = 'Your favorite tools',
  limit = 6,
}: FavoritesProps) {
  const [paths, setPaths] = useState<readonly string[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setPaths(readFavorites(window.localStorage).slice(0, limit));
  }, [limit]);

  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:favorites:v1') {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  if (paths.length === 0) return null;

  return (
    <section className="ppg-favs" aria-label={heading}>
      <header className="ppg-favs__head">
        <p className="ppg-favs__eyebrow">
          <Star aria-hidden="true" /> {heading}
        </p>
        <div className="ppg-favs__head-meta">
          <span className="ppg-favs__count" aria-label={`${paths.length} favorites`}>
            {paths.length} favorited
          </span>
          <Link to="/persona-playground/favorites" className="ppg-favs__view-all">
            View all
            <ArrowRight aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="ppg-favs__clear"
            onClick={() => {
              if (typeof window === 'undefined') return;
              clearFavorites(window.localStorage);
              setPaths([]);
            }}
            aria-label="Clear favorites"
          >
            <Trash2 aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </header>
      <ul className="ppg-favs__list">
        {paths.map((path) => {
          const tool = TOOL_BY_PATH.get(path);
          if (!tool) return null;
          return (
            <li key={path} className="ppg-favs__item">
              <Link to={path} className="ppg-favs__link">
                <span className="ppg-favs__name">{tool.name}</span>
                <span className="ppg-favs__tagline">{tool.tagline}</span>
              </Link>
              <button
                type="button"
                className="ppg-favs__unstar"
                onClick={() => {
                  if (typeof window === 'undefined') return;
                  toggleFavorite(window.localStorage, path);
                  refresh();
                }}
                aria-label={`Remove ${tool.name} from favorites`}
              >
                <Star aria-hidden="true" fill="currentColor" strokeWidth={1.6} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
