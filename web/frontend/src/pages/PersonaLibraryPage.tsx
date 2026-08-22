import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Calendar,
  Dices,
  Library,
  Search,
  Share2,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  PERSONA_LIBRARY_CATEGORIES,
  PERSONA_LIBRARY_ENTRIES,
  dailyFeaturedEntry,
  entriesByCategory,
  entriesFeaturedFirst,
  libraryArenaLink,
  libraryShareUrl,
  pickRandomEntry,
  todayIsoDate,
  type LibraryCategory,
  type PersonaLibraryEntry,
} from '../data/personaLibrary';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-library-page.css';

const SAVED_KEY = 'arena:persona-library:saved:v1';
const SAVED_LIMIT = 24;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

function readSaved(): ReadonlyArray<string> {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, SAVED_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeSaved(ids: ReadonlyArray<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(ids.slice(0, SAVED_LIMIT)));
  } catch {
    /* silent */
  }
}

export function PersonaLibraryPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();

  const [category, setCategory] = useState<LibraryCategory | null>(null);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<ReadonlyArray<string>>([]);
  const [pageVisible, setPageVisible] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [surpriseId, setSurpriseId] = useState<string | null>(null);
  const [featuredToday, setFeaturedToday] = useState<PersonaLibraryEntry | null>(null);

  useEffect(() => {
    setPageVisible(true);
    setSaved(readSaved());
    setFeaturedToday(dailyFeaturedEntry(todayIsoDate()));
    const entry = searchParams.get('entry');
    if (entry) {
      // Scroll to entry once rendered
      window.setTimeout(() => {
        const el = document.getElementById(`entry-${entry}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    let next = entriesByCategory(PERSONA_LIBRARY_ENTRIES, category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      next = next.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.prompt.toLowerCase().includes(q),
      );
    }
    return entriesFeaturedFirst(next);
  }, [category, query]);

  const onSurpriseMe = () => {
    const random = pickRandomEntry(filtered.length > 0 ? filtered : PERSONA_LIBRARY_ENTRIES);
    if (!random) return;
    setSurpriseId(random.id);
    // Smooth scroll into view
    window.setTimeout(() => {
      const el = document.getElementById(`entry-${random.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const onSave = (id: string) => {
    setSaved((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, SAVED_LIMIT);
      writeSaved(next);
      return next;
    });
  };

  const onUnsave = (id: string) => {
    setSaved((prev) => {
      const next = prev.filter((x) => x !== id);
      writeSaved(next);
      return next;
    });
  };

  const onShare = async (entry: PersonaLibraryEntry) => {
    if (typeof window === 'undefined') return;
    const url = libraryShareUrl(window.location.origin, entry.id);
    const text = `${entry.title} — a curated Arena prompt.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: entry.title, text, url });
        return;
      } catch (err) {
        /* fall through */
      }
    }
    const ok = await copyToClipboard(`${text} ${url}`);
    if (ok) {
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const onTry = (entry: PersonaLibraryEntry) => {
    if (typeof window === 'undefined') return;
    const link = libraryArenaLink(window.location.origin, entry.prompt);
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    setRedirectIntent(link);
    navigate('/signin?tab=signup');
  };

  return (
    <div className={`plib-page${pageVisible ? ' plib-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`plib-main${reduceMotion ? '' : ' plib-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="plib-title"
      >
        <section className="plib-hero">
          <p className="plib-hero__eyebrow">
            <Library aria-hidden="true" /> Persona Library
          </p>
          <h1 id="plib-title" className="plib-hero__title">
            <span>Curated prompts.</span>
            <span className="plib-hero__title-accent">Built for Arena.</span>
          </h1>
          <p className="plib-hero__lede">
            Hand-picked prompts designed to show off the panel — strategy,
            analysis, ethics, learning, and more. Save what resonates, share
            what lands, send it straight into Arena with one click.
          </p>
        </section>

        <section className="plib-controls" aria-label="Library controls">
          <div className="plib-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              className="plib-search__input"
              placeholder="Search prompts, titles, descriptions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search library"
            />
            {query && (
              <button
                type="button"
                className="plib-search__clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            className="plib-categories"
            role="radiogroup"
            aria-label="Filter by category"
          >
            <Pressable
              type="button"
              role="radio"
              aria-checked={category === null}
              className={`plib-category${category === null ? ' plib-category--active' : ''}`}
              onClick={() => setCategory(null)}
            >
              All ({PERSONA_LIBRARY_ENTRIES.length})
            </Pressable>
            {PERSONA_LIBRARY_CATEGORIES.map((c) => {
              const count = PERSONA_LIBRARY_ENTRIES.filter(
                (e) => e.category === c.id,
              ).length;
              return (
                <Pressable
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  className={`plib-category${category === c.id ? ' plib-category--active' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label} ({count})
                </Pressable>
              );
            })}
            <Pressable
              type="button"
              className="plib-surprise"
              onClick={onSurpriseMe}
              aria-label="Surprise me with a random prompt"
            >
              <Dices aria-hidden="true" /> Surprise me
            </Pressable>
          </div>
        </section>

        {featuredToday && (
          <aside className="plib-featured" aria-label="Today's featured prompt">
            <div className="plib-featured__head">
              <p className="plib-featured__kicker">
                <Calendar aria-hidden="true" /> Today's featured prompt
              </p>
              <p className="plib-featured__date">{todayIsoDate()}</p>
            </div>
            <h2 className="plib-featured__title">{featuredToday.title}</h2>
            <p className="plib-featured__description">{featuredToday.description}</p>
            <blockquote className="plib-featured__prompt">"{featuredToday.prompt}"</blockquote>
            <div className="plib-featured__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={() => onTry(featuredToday)}
                icon={<Swords aria-hidden="true" />}
              >
                Try in Arena
              </MotionButton>
              <Pressable
                type="button"
                className="plib-featured__jump"
                onClick={() => {
                  window.setTimeout(() => {
                    const el = document.getElementById(`entry-${featuredToday.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 50);
                }}
              >
                <ArrowRight aria-hidden="true" /> Jump to entry
              </Pressable>
            </div>
          </aside>
        )}

        <section className="plib-results" aria-label="Library entries">
          {filtered.length === 0 ? (
            <div className="plib-empty">
              <p>No prompts match your filter.</p>
              <div className="plib-empty__actions">
                <Pressable
                  type="button"
                  className="plib-empty__cta"
                  onClick={() => {
                    setCategory(null);
                    setQuery('');
                  }}
                >
                  <X aria-hidden="true" /> Clear filters
                </Pressable>
                <Pressable
                  type="button"
                  className="plib-empty__cta plib-empty__cta--alt"
                  onClick={onSurpriseMe}
                >
                  <Dices aria-hidden="true" /> Surprise me instead
                </Pressable>
              </div>
            </div>
          ) : (
            <ul className="plib-list">
              {filtered.map((entry) => {
                const isSaved = saved.includes(entry.id);
                return (
                  <li
                    key={entry.id}
                    id={`entry-${entry.id}`}
                    className={`plib-entry plib-entry--${entry.tone}${entry.featured ? ' plib-entry--featured' : ''}${surpriseId === entry.id ? ' plib-entry--surprise' : ''}`}
                  >
                    <header className="plib-entry__head">
                      <p className="plib-entry__category">
                        {PERSONA_LIBRARY_CATEGORIES.find((c) => c.id === entry.category)?.label}
                        {entry.featured && (
                          <span className="plib-entry__featured">
                            <Sparkles aria-hidden="true" /> Featured
                          </span>
                        )}
                      </p>
                      <h2 className="plib-entry__title">{entry.title}</h2>
                      <p className="plib-entry__description">{entry.description}</p>
                    </header>

                    <blockquote className="plib-entry__prompt">
                      "{entry.prompt}"
                    </blockquote>

                    {entry.suggestedPersonas && entry.suggestedPersonas.length > 0 && (
                      <div className="plib-entry__personas">
                        <p className="plib-entry__personas-label">
                          Try with this panel
                        </p>
                        <div className="plib-entry__personas-row">
                          {entry.suggestedPersonas.map((id) => {
                            const persona = findPersona(id);
                            if (!persona) return null;
                            return (
                              <span
                                key={id}
                                className="plib-entry__persona"
                                style={{ ['--plib-persona-color' as string]: persona.color }}
                                title={persona.quote}
                              >
                                <span
                                  className="plib-entry__persona-dot"
                                  aria-hidden="true"
                                />
                                <span className="plib-entry__persona-name">
                                  {persona.name}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="plib-entry__actions">
                      <MotionButton
                        type="button"
                        variant="primary"
                        size="md"
                        onClick={() => onTry(entry)}
                        icon={<Swords aria-hidden="true" />}
                      >
                        Try in Arena
                      </MotionButton>
                      <Pressable
                        type="button"
                        className={`plib-entry__save${isSaved ? ' plib-entry__save--saved' : ''}`}
                        onClick={() => (isSaved ? onUnsave(entry.id) : onSave(entry.id))}
                        aria-label={isSaved ? `Remove ${entry.title} from saved` : `Save ${entry.title}`}
                      >
                        {isSaved ? (
                          <>
                            <Bookmark aria-hidden="true" /> Saved
                          </>
                        ) : (
                          <>
                            <BookmarkPlus aria-hidden="true" /> Save
                          </>
                        )}
                      </Pressable>
                      <Pressable
                        type="button"
                        className="plib-entry__share"
                        onClick={() => onShare(entry)}
                        aria-label={`Share ${entry.title}`}
                      >
                        <Share2 aria-hidden="true" />
                        {copiedId === entry.id ? 'Copied' : 'Share'}
                      </Pressable>
                      <a
                        className="plib-entry__link"
                        href={libraryShareUrl(
                          typeof window !== 'undefined' ? window.location.origin : '',
                          entry.id,
                        )}
                      >
                        <ArrowRight aria-hidden="true" /> Direct link
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
