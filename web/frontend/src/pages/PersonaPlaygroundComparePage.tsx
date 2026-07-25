import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, GitCompare, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import {
  buildCompareShareUrl,
  compareEntries,
  findMatchupByPaths,
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundEntry,
} from '../data/personaPlayground';
import { recordRecentComparison } from '../lib/recentComparisons';
import { recordRecentShare } from '../lib/recentShares';
import '../styles/persona-compare-page.css';

const CATEGORY_DOT_COLOR: Record<string, string> = {
  discover: '#8aa3ff',
  versus: '#ff8a8a',
  council: '#c8b9ff',
  roast: '#ffb480',
  decide: '#9be3c2',
  forecast: '#ffd86b',
  mosaic: '#f7a8e0',
};

export function PersonaPlaygroundComparePage() {
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const [pageVisible, setPageVisible] = useState(false);

  const a = params.get('a');
  const b = params.get('b');

  const pair = useMemo(() => compareEntries(a, b), [a, b]);
  const matchup = useMemo(() => findMatchupByPaths(a, b), [a, b]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!pair || !a || !b) return;
    recordRecentComparison(window.localStorage, a, b);
  }, [pair, a, b]);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  const onTryInArena = (path: string) => {
    if (!isAuthenticated) {
      setRedirectIntent(path);
    }
  };

  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<number | null>(null);
  const onCopyShareUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = buildCompareShareUrl(window.location.origin, a, b);
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (!ok) return;
    setCopied(true);
    if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopied(false), 1800);
    // Record the share event so the hub's RecentShares widget can re-surface it.
    const match = findMatchupByPaths(a, b);
    recordRecentShare(window.localStorage, {
      kind: 'compare',
      label: match?.title ?? 'Compare two tools',
      url,
    });
  }, [a, b]);

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) window.clearTimeout(copyResetRef.current);
    };
  }, []);

  return (
    <div className={`pcmp-page${pageVisible ? ' pcmp-page--enter' : ''}`}>
      <Navbar />

      <main className="pcmp-main">
        {matchup && (
          <nav className="pcmp-matchup-banner" aria-label="Curated matchup">
            <Link to="/persona-playground" className="pcmp-matchup-banner__back">
              <ArrowLeft aria-hidden="true" />
              <span>All matchups</span>
            </Link>
            <span className="pcmp-matchup-banner__title">
              <GitCompare aria-hidden="true" />
              {matchup.title}
            </span>
            <p className="pcmp-matchup-banner__summary">{matchup.summary}</p>
          </nav>
        )}
        <section className="pcmp-hero">
          <p className="pcmp-hero__eyebrow">
            <GitCompare aria-hidden="true" /> Compare tools
          </p>
          <h1 id="pcmp-title" className="pcmp-hero__title">
            <span>Two tools,</span>
            <span className="pcmp-hero__title-accent">side by side.</span>
          </h1>
          {pair && (
            <button
              type="button"
              className={`pcmp-hero__copy${copied ? ' pcmp-hero__copy--copied' : ''}`}
              onClick={onCopyShareUrl}
              aria-live="polite"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" />
                  Share URL copied
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" />
                  Copy share URL
                </>
              )}
            </button>
          )}
          <p className="pcmp-hero__lede">
            Put any two Arena tools next to each other — share a comparison URL, weigh the
            trade-offs, and pick the one that fits the prompt you have in front of you.
          </p>
        </section>

        {pair ? (
          <Reveal as="section" className="pcmp-pair" aria-label="Tool comparison">
            <CompareCard
              slot="A"
              entry={pair[0]}
              onTryInArena={onTryInArena}
              otherName={pair[1].name}
              otherPath={pair[1].path}
            />
            <div className="pcmp-vs" aria-hidden="true">
              <span>vs</span>
            </div>
            <CompareCard
              slot="B"
              entry={pair[1]}
              onTryInArena={onTryInArena}
              otherName={pair[0].name}
              otherPath={pair[0].path}
            />
          </Reveal>
        ) : (
          <Reveal as="section" className="pcmp-empty" aria-label="No tools selected">
            <p className="pcmp-empty__lede">
              Pick two tools from the playground to compare them here.
            </p>
            <Link to="/persona-playground" className="pcmp-empty__cta">
              <Sparkles aria-hidden="true" />
              Open the playground
              <ArrowRight aria-hidden="true" />
            </Link>
            <p className="pcmp-empty__hint">
              Or share a URL like{' '}
              <code>/persona-playground/compare?a=/persona-council&b=/persona-mosaic-council</code>.
            </p>
          </Reveal>
        )}
      </main>

      <Footer />
    </div>
  );
}

function CompareCard({
  slot,
  entry,
  onTryInArena,
  otherName,
  otherPath,
}: {
  slot: 'A' | 'B';
  entry: PersonaPlaygroundEntry;
  onTryInArena: (path: string) => void;
  otherName: string;
  otherPath: string;
}) {
  const dotColor = CATEGORY_DOT_COLOR[entry.category] ?? 'var(--ppg-accent-dim)';
  return (
    <article
      className="pcmp-card"
      style={{ '--pcmp-dot': dotColor } as React.CSSProperties}
      aria-label={`Slot ${slot}: ${entry.name}`}
    >
      <header className="pcmp-card__head">
        <span className="pcmp-card__slot">Slot {slot}</span>
        <span className="pcmp-card__tag" aria-hidden="true" />
      </header>
      <p className="pcmp-card__cat">{personaPlaygroundCategoryLabel(entry.category)}</p>
      <h2 className="pcmp-card__name">{entry.name}</h2>
      <p className="pcmp-card__tagline">{entry.tagline}</p>
      <p className="pcmp-card__blurb">{entry.blurb}</p>

      <dl className="pcmp-card__meta">
        <div>
          <dt>Format</dt>
          <dd>{entry.format}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{personaPlaygroundCategoryLabel(entry.category)}</dd>
        </div>
      </dl>

      <div className="pcmp-card__actions">
        <Link
          to={entry.path}
          className="pcmp-card__try"
          onClick={() => onTryInArena(entry.path)}
        >
          Try {entry.name}
          <ArrowRight aria-hidden="true" />
        </Link>
        <Link
          to={`/persona-playground/compare?a=${encodeURIComponent(entry.path)}&b=${encodeURIComponent(otherPath)}`}
          className="pcmp-card__swap"
          aria-label={`Swap with ${otherName}`}
        >
          Swap with {otherName}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
