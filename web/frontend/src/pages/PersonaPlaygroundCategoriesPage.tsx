import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Layers } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { prefersReducedMotion } from '../lib/motion';
import { categorySummaries } from '../data/personaPlayground';
import '../styles/persona-categories-page.css';

export function PersonaPlaygroundCategoriesPage() {
  const summaries = categorySummaries();
  const [pageVisible, setPageVisible] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  // Focus the heading on arrival so screen-reader / keyboard users land
  // on the page title (not the body) when Shift+G navigates them here.
  // We focus the heading without scrolling so the smooth-page-enter
  // animation stays intact; the next Tab takes the user into the grid.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    // Only refocus when the user is arriving fresh (focus is on body or
    // nothing) — not when navigating back via a non-keyboard trigger.
    if (active && active !== document.body && active.tagName !== 'HTML') return;
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={`pcat-page${pageVisible ? ' pcat-page--enter' : ''}`}>
      <Navbar />

      <main className="pcat-main">
        <section className="pcat-hero">
          <Link to="/persona-playground" className="pcat-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="pcat-hero__eyebrow">
            <Layers aria-hidden="true" /> Categories
          </p>
          <h1
            id="pcat-title"
            ref={headingRef}
            tabIndex={-1}
            className="pcat-hero__title"
          >
            <span>Browse the playground</span>
            <span className="pcat-hero__title-accent">by category.</span>
          </h1>
          <p className="pcat-hero__lede">
            Every tool on the playground belongs to one of seven categories — quiz-driven
            discovery, head-to-head adjudication, multi-mind councils, roasting, forced-choice
            decisions, future forecasting, and Mosaic-style hand-picked panels. Pick a category
            to see the tools inside it, or jump straight to the full hub.
          </p>
          <p className="pcat-hero__shortcut-hint">
            <kbd className="pcat-hero__kbd" aria-hidden="true">Shift + G</kbd>
            <span>Press this shortcut on the hub to jump back here.</span>
          </p>
        </section>

        <Reveal as="section" className="pcat-grid-wrap" aria-label="Categories">
          <ul className="pcat-grid">
            {summaries.map((summary) => (
              <li key={summary.category} className="pcat-card">
                <Link
                  to={`/persona-playground?cat=${summary.category}`}
                  className="pcat-card__link"
                >
                  <p className="pcat-card__tag">{summary.label}</p>
                  <p className="pcat-card__count">
                    <strong>{summary.count}</strong>
                    <span>{summary.count === 1 ? 'tool' : 'tools'}</span>
                  </p>
                  <p className="pcat-card__desc">{summary.description}</p>
                  <span className="pcat-card__cta">
                    Open category
                    <ArrowRight aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal as="section" className="pcat-fallback" aria-label="See everything">
          <p className="pcat-fallback__copy">
            Want the full grid? The hub has all 27 tools with search and category filters.
          </p>
          <Link to="/persona-playground" className="pcat-fallback__cta">
            Open the full playground
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
