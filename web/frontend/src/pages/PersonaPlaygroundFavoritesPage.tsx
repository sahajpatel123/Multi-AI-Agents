import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Star, StarOff, Trash2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { RecentlyFavorited } from '../components/RecentlyFavorited';
import { prefersReducedMotion } from '../lib/motion';
import {
  readFavorites,
  toggleFavorite,
  clearFavorites,
} from '../lib/favorites';
import { PERSONA_PLAYGROUND_ENTRIES } from '../data/personaPlayground';
import '../styles/persona-favorites-page.css';

const TOOL_BY_PATH = new Map(
  PERSONA_PLAYGROUND_ENTRIES.map((e) => [e.path, e] as const),
);

export function PersonaPlaygroundFavoritesPage() {
  const [pageVisible, setPageVisible] = useState(false);
  const [paths, setPaths] = useState<readonly string[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setPaths(readFavorites(window.localStorage));
  }, []);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'arena:persona-playground:favorites:v1') {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  return (
    <div className={`pfav-page${pageVisible ? ' pfav-page--enter' : ''}`}>
      <Navbar />

      <main className="pfav-main">
        <section className="pfav-hero">
          <Link to="/persona-playground" className="pfav-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="pfav-hero__eyebrow">
            <Star aria-hidden="true" /> Your favorites
          </p>
          <h1 id="pfav-title" className="pfav-hero__title">
            <span>Tools you've</span>
            <span className="pfav-hero__title-accent">claimed.</span>
          </h1>
          <p className="pfav-hero__lede">
            The persona tools you starred from the hub. Starring is local-only — nothing
            leaves your browser — so this page is the canonical list. Click any card to
            open the tool; tap the star to remove it from your collection.
          </p>
        </section>

        {paths.length === 0 ? (
          <Reveal as="section" className="pfav-empty" aria-label="No favorites yet">
            <StarOff aria-hidden="true" className="pfav-empty__icon" />
            <p className="pfav-empty__lede">
              You haven't starred any tools yet. Open the hub and tap a star on any card to
              start your collection.
            </p>
            <Link to="/persona-playground" className="pfav-empty__cta">
              Open the hub
              <ArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        ) : (
          <>
            <Reveal as="section" className="pfav-grid-wrap" aria-label="Favorite tools">
              <ul className="pfav-grid">
                {paths.map((path) => {
                  const tool = TOOL_BY_PATH.get(path);
                  if (!tool) return null;
                  return (
                    <li key={path} className="pfav-card">
                      <Link to={path} className="pfav-card__link">
                        <p className="pfav-card__format">{tool.format}</p>
                        <h2 className="pfav-card__name">{tool.name}</h2>
                        <p className="pfav-card__tagline">{tool.tagline}</p>
                        <span className="pfav-card__cta">
                          Open
                          <ArrowRight aria-hidden="true" />
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="pfav-card__unstar"
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
            </Reveal>

            <div className="pfav-clear-row">
              <button
                type="button"
                className="pfav-clear-btn"
                onClick={() => {
                  if (typeof window === 'undefined') return;
                  clearFavorites(window.localStorage);
                  setPaths([]);
                }}
                aria-label="Clear all favorites"
              >
                <Trash2 aria-hidden="true" />
                <span>Clear all favorites</span>
              </button>
            </div>
          </>
        )}

        <RecentlyFavorited />
      </main>

      <Footer />
    </div>
  );
}
