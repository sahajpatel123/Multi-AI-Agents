import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, GitCompare, Layers, ListOrdered, Map, Search, Sparkles, Star, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { RelatedTools } from '../components/RelatedTools';
import { Matchups } from '../components/Matchups';
import { RecentComparisons } from '../components/RecentComparisons';
import { RecentTools } from '../components/RecentTools';
import { DailyStreak } from '../components/DailyStreak';
import { SurpriseButton } from '../components/SurpriseButton';
import { ToolsNotYetTried } from '../components/ToolsNotYetTried';
import { PersonaPlaygroundStats } from '../components/PersonaPlaygroundStats';
import { RandomToolButton } from '../components/RandomToolButton';
import { CompareFromCategoryButton } from '../components/CompareFromCategoryButton';
import { ToolForPurpose } from '../components/ToolForPurpose';
import { FeaturedArchive } from '../components/FeaturedArchive';
import { RecentShares } from '../components/RecentShares';
import { Favorites } from '../components/Favorites';
import { useAuth } from '../hooks/useAuth';
import { prefersReducedMotion } from '../lib/motion';
import { isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import { recordFeaturedPick } from '../lib/featuredArchive';
import { setRedirectIntent } from '../utils/redirectIntent';

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
import {
  PERSONA_PLAYGROUND_ENTRIES,
  clearFeaturedDismissState,
  isDismissedFor,
  personaPlaygroundCategories,
  personaPlaygroundCategoryLabel,
  pickFeaturedOfDay,
  readFeaturedDismissState,
  writeFeaturedDismissState,
  type PersonaPlaygroundCategory,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import '../styles/persona-playground-page.css';

const ALL_CATEGORIES: readonly PersonaPlaygroundCategory[] = personaPlaygroundCategories();
const DEFAULT_CATEGORY = 'all' as const;
type CategoryFilter = typeof DEFAULT_CATEGORY | PersonaPlaygroundCategory;
const ALL_FILTERS: ReadonlyArray<{ key: CategoryFilter; label: string }> = [
  { key: DEFAULT_CATEGORY, label: 'All' },
  ...ALL_CATEGORIES.map((c) => ({ key: c as CategoryFilter, label: personaPlaygroundCategoryLabel(c) })),
];
const FILTER_TABLIST_ID = 'ppg-filter-tabs';
const FILTER_PANEL_ID = 'ppg-filter-panel';

function readCategoryFromUrl(value: string | null): CategoryFilter {
  if (!value) return DEFAULT_CATEGORY;
  if (value === DEFAULT_CATEGORY) return DEFAULT_CATEGORY;
  if ((ALL_CATEGORIES as readonly string[]).includes(value)) {
    return value as CategoryFilter;
  }
  return DEFAULT_CATEGORY;
}

function matchesFilter(
  entry: PersonaPlaygroundEntry,
  query: string,
  category: CategoryFilter,
): boolean {
  if (category !== DEFAULT_CATEGORY && entry.category !== category) return false;
  if (!query) return true;
  const haystack = `${entry.name} ${entry.tagline} ${entry.blurb} ${entry.format}`.toLowerCase();
  return haystack.includes(query);
}

export function PersonaPlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [pageVisible, setPageVisible] = useState(false);
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<number | null>(null);

  const category = readCategoryFromUrl(params.get('cat'));

  const today = useMemo(() => new Date(), []);
  const featured = useMemo(() => pickFeaturedOfDay(today), [today]);

  useEffect(() => {
    if (typeof window === 'undefined' || !featured) return;
    recordFeaturedPick(window.localStorage, featured.path, formatLocalDate(today));
  }, [featured, today]);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isDismissedFor(today, readFeaturedDismissState(window.localStorage));
  });

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isBareSlashKey(event) || !shouldCaptureSlashFocus(event.target)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onCategoryClick = useCallback(
    (next: CategoryFilter) => {
      const nextParams = new URLSearchParams(params);
      if (next === DEFAULT_CATEGORY) nextParams.delete('cat');
      else nextParams.set('cat', next);
      if (!nextParams.get('q')) nextParams.delete('q');
      setParams(nextParams, { replace: true });
    },
    [params, setParams],
  );

  const onSearchChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = window.setTimeout(() => {
        const nextParams = new URLSearchParams(params);
        const trimmed = value.trim();
        if (!trimmed) nextParams.delete('q');
        else nextParams.set('q', trimmed);
        if (nextParams.get('cat') === DEFAULT_CATEGORY) nextParams.delete('cat');
        setParams(nextParams, { replace: true });
      }, 200);
    },
    [params, setParams],
  );

  const onClearSearch = useCallback(() => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current);
    }
    setQuery('');
    const nextParams = new URLSearchParams(params);
    nextParams.delete('q');
    if (category === DEFAULT_CATEGORY) nextParams.delete('cat');
    setParams(nextParams, { replace: true });
    searchInputRef.current?.focus();
  }, [params, setParams, category]);

  const onDismissFeatured = useCallback(() => {
    writeFeaturedDismissState(
      typeof window === 'undefined' ? null : window.localStorage,
      today,
    );
    setDismissed(true);
  }, [today]);

  const onRestoreFeatured = useCallback(() => {
    clearFeaturedDismissState(typeof window === 'undefined' ? null : window.localStorage);
    setDismissed(false);
  }, []);

  const onTryInArena = useCallback(
    (path: string) => {
      if (isAuthenticated) {
        return;
      }
      setRedirectIntent(path);
    },
    [isAuthenticated],
  );

  const visible = useMemo(
    () =>
      PERSONA_PLAYGROUND_ENTRIES.filter((entry) =>
        matchesFilter(entry, query.trim().toLowerCase(), category),
      ),
    [query, category],
  );

  const counts = useMemo<Record<CategoryFilter, number>>(() => {
    // Seed from ALL_CATEGORIES so a future category addition to
    // the type automatically gets a 0-initialized key, rather than
    // silently dropping entries from the rendered count.
    const byCategory = {} as Record<CategoryFilter, number>;
    byCategory.all = PERSONA_PLAYGROUND_ENTRIES.length;
    for (const c of ALL_CATEGORIES) byCategory[c] = 0;
    for (const entry of PERSONA_PLAYGROUND_ENTRIES) byCategory[entry.category] += 1;
    return byCategory;
  }, []);

  const showFeatured = featured && !dismissed;
  const showRestore = featured && dismissed;

  return (
    <div className={`ppg-page${pageVisible ? ' ppg-page--enter' : ''}`}>
      <Navbar />

      <main className="ppg-main">
        <section className="ppg-hero">
          <p className="ppg-hero__eyebrow">
            <Sparkles aria-hidden="true" /> Persona Playground
          </p>
          <h1 id="ppg-title" className="ppg-hero__title">
            <span>Every Arena tool,</span>
            <span className="ppg-hero__title-accent">one playground.</span>
          </h1>
          <p className="ppg-hero__lede">
            {PERSONA_PLAYGROUND_ENTRIES.length} ways to put the sixteen Arena minds to work. Pick
            one, run the experiment, take the verdict back to your real prompt.
          </p>

          <div className="ppg-hero__search">
            <label htmlFor="ppg-search" className="ppg-hero__search-label">
              Search tools
            </label>
            <div className="ppg-search">
              <Search aria-hidden="true" className="ppg-search__icon" />
              <input
                ref={searchInputRef}
                id="ppg-search"
                type="search"
                className="ppg-search__input"
                placeholder="Search by name, format, or idea…"
                value={query}
                onChange={(event) => onSearchChange(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className="ppg-search__clear"
                  onClick={onClearSearch}
                  aria-label="Clear search"
                >
                  <X aria-hidden="true" />
                </button>
              )}
              <kbd className="ppg-search__hint" aria-hidden="true">
                /
              </kbd>
            </div>
          </div>
        </section>

        {showFeatured && featured && (
          <Reveal as="section" className="ppg-featured" aria-label="Today's pick">
            <div className="ppg-featured__body">
              <p className="ppg-featured__tag">
                <Star aria-hidden="true" /> Today's pick
              </p>
              <h2 className="ppg-featured__name">{featured.name}</h2>
              <p className="ppg-featured__tagline">{featured.tagline}</p>
              <p className="ppg-featured__blurb">{featured.blurb}</p>
            </div>
            <div className="ppg-featured__actions">
              <Link
                to={featured.path}
                className="ppg-featured__link"
                onClick={() => onTryInArena(featured.path)}
              >
                Try it
                <ArrowRight aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="ppg-featured__dismiss"
                onClick={onDismissFeatured}
                aria-label="Dismiss today's pick"
              >
                <X aria-hidden="true" />
                <span>Dismiss</span>
              </button>
            </div>
          </Reveal>
        )}

        {showRestore && featured && (
          <div className="ppg-featured-restore">
            <button
              type="button"
              className="ppg-featured-restore__btn"
              onClick={onRestoreFeatured}
            >
              Bring back today's pick
            </button>
          </div>
        )}

        <Reveal
          as="section"
          className="ppg-filters"
          aria-label="Filter persona tools"
        >
          <div
            id={FILTER_TABLIST_ID}
            role="tablist"
            aria-label="Categories"
            aria-controls={FILTER_PANEL_ID}
            className="ppg-filters__chips"
          >
            {ALL_FILTERS.map((filter) => {
              const isActive = category === filter.key;
              const count = counts[filter.key] ?? 0;
              return (
                <button
                  key={filter.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={FILTER_PANEL_ID}
                  className={`ppg-chip${isActive ? ' ppg-chip--active' : ''}`}
                  onClick={() => onCategoryClick(filter.key)}
                >
                  <span>{filter.label}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>
          <p className="ppg-filters__count" aria-live="polite">
            Showing {visible.length} of {PERSONA_PLAYGROUND_ENTRIES.length} tools
          </p>
        </Reveal>

        <Reveal
          as="section"
          id={FILTER_PANEL_ID}
          className="ppg-grid-wrap"
          aria-label="Persona tools"
          role="tabpanel"
          aria-labelledby={FILTER_TABLIST_ID}
        >
          {visible.length === 0 ? (
            <div className="ppg-empty" role="status">
              <p>No tools match that search yet.</p>
              <button
                type="button"
                className="ppg-empty__reset"
                onClick={onClearSearch}
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul className="ppg-grid">
              {visible.map((entry) => (
                <li key={entry.path} className="ppg-card">
                  <p className="ppg-card__tag">{personaPlaygroundCategoryLabel(entry.category)}</p>
                  <h2 className="ppg-card__name">{entry.name}</h2>
                  <p className="ppg-card__tagline">{entry.tagline}</p>
                  <p className="ppg-card__blurb">{entry.blurb}</p>
                  <p className="ppg-card__format">{entry.format}</p>
                  <div className="ppg-card__actions">
                    <Link
                      to={entry.path}
                      className="ppg-card__link"
                      onClick={() => onTryInArena(entry.path)}
                    >
                      Try it
                      <ArrowRight aria-hidden="true" />
                    </Link>
                    <Link to="/personas" className="ppg-card__browse">
                      Browse minds
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Reveal>

        <RelatedTools path="/persona-playground" />

        <FeaturedArchive />

        <RecentShares />

        <DailyStreak />

        <RecentTools />

        <PersonaPlaygroundStats />

        <Reveal as="section" className="ppg-categories-cta" aria-label="Browse by category">
          <div className="ppg-categories-cta__copy">
            <p className="ppg-categories-cta__eyebrow">
              <Layers aria-hidden="true" /> Browse by category
            </p>
            <h2 className="ppg-categories-cta__title">Want to scan the catalog by shape?</h2>
            <p className="ppg-categories-cta__lede">
              Seven categories — Discover, Versus, Council, Roast, Decide, Forecast, Mosaic —
              each with a tool count and a one-line description. Jump straight to the ones
              that match your task.
            </p>
          </div>
          <Link to="/persona-playground/categories" className="ppg-categories-cta__btn">
            Browse all 7 categories
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal as="section" className="ppg-index-cta" aria-label="A-Z index">
          <div className="ppg-index-cta__copy">
            <p className="ppg-index-cta__eyebrow">
              <ListOrdered aria-hidden="true" /> A-Z index
            </p>
            <h2 className="ppg-index-cta__title">Want to scan every tool in one list?</h2>
            <p className="ppg-index-cta__lede">
              The alphabetical index lists all 27 tools A–Z with format and category, no
              filtering — just a dense reference surface for power users and crawlers.
            </p>
          </div>
          <Link to="/persona-playground/index" className="ppg-index-cta__btn">
            View A-Z index
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal as="section" className="ppg-whatsnew-cta" aria-label="What's new">
          <div className="ppg-whatsnew-cta__copy">
            <p className="ppg-whatsnew-cta__eyebrow">
              <Sparkles aria-hidden="true" /> What's new
            </p>
            <h2 className="ppg-whatsnew-cta__title">Haven't visited in a while?</h2>
            <p className="ppg-whatsnew-cta__lede">
              The playground just shipped a curated changelog — hub, compare, matchups,
              streak, favorites, categories, A-Z index. Catch up on what you've missed.
            </p>
          </div>
          <Link to="/persona-playground/whats-new" className="ppg-whatsnew-cta__btn">
            See what's new
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal as="section" className="ppg-formats-cta" aria-label="Browse by format">
          <div className="ppg-formats-cta__copy">
            <p className="ppg-formats-cta__eyebrow">
              <Layers aria-hidden="true" /> By format
            </p>
            <h2 className="ppg-formats-cta__title">Want to find every tool of a particular shape?</h2>
            <p className="ppg-formats-cta__lede">
              Many categories share a format — "4-mind panel" appears in council, versus,
              and roast. Browse every tool that matches a particular shape, regardless of
              category.
            </p>
          </div>
          <Link to="/persona-playground/formats" className="ppg-formats-cta__btn">
            View by format
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal as="section" className="ppg-sitemap-cta" aria-label="Sitemap">
          <div className="ppg-sitemap-cta__copy">
            <p className="ppg-sitemap-cta__eyebrow">
              <Map aria-hidden="true" /> Sitemap
            </p>
            <h2 className="ppg-sitemap-cta__title">Want a map of every page?</h2>
            <p className="ppg-sitemap-cta__lede">
              The sitemap lists every public persona-playground route with a one-line
              description — the table of contents for the hub.
            </p>
          </div>
          <Link to="/persona-playground/sitemap" className="ppg-sitemap-cta__btn">
            View sitemap
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>

        <Favorites />

        <ToolsNotYetTried />

        <SurpriseButton />

        <RandomToolButton excludePaths={featured ? [featured.path] : []} />

        <CompareFromCategoryButton excludePaths={featured ? [featured.path] : []} />

        <ToolForPurpose />

        <RecentComparisons />

        <Matchups />

        <Reveal as="section" className="ppg-compare-cta" aria-label="Compare tools">
          <div className="ppg-compare-cta__copy">
            <p className="ppg-compare-cta__eyebrow">
              <GitCompare aria-hidden="true" /> Compare two tools
            </p>
            <h2 className="ppg-compare-cta__title">Pit any two tools side by side.</h2>
            <p className="ppg-compare-cta__lede">
              Start with a featured matchup or grab any two from the catalog. Comparison URLs
              are shareable — paste a verdict into a chat, embed it in a doc, or keep it for
              next week.
            </p>
          </div>
          <div className="ppg-compare-cta__actions">
            <Link
              to={`/persona-playground/compare?a=${encodeURIComponent(PERSONA_PLAYGROUND_ENTRIES[0].path)}&b=${encodeURIComponent(PERSONA_PLAYGROUND_ENTRIES[1].path)}`}
              className="ppg-compare-cta__btn"
            >
              Try a matchup
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
