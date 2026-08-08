import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Map } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { PersonaPlaygroundStats } from '../components/PersonaPlaygroundStats';
import { RandomToolButton } from '../components/RandomToolButton';
import { CompareFromCategoryButton } from '../components/CompareFromCategoryButton';
import { PERSONA_PLAYGROUND_SITEMAP } from '../data/personaPlayground';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-sitemap-page.css';

export function PersonaPlaygroundSitemapPage() {
  const [pageVisible, setPageVisible] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  // Focus the heading on arrival so screen-reader / keyboard users land
  // on the page title (not the body) when Shift+P navigates them here.
  // Mirror of cycles 471 (categories) and 473 (whats-new): only refocus
  // when the user is arriving fresh, never steal focus from a click.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active && active !== document.body && active.tagName !== 'HTML') return;
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={`psm-page${pageVisible ? ' psm-page--enter' : ''}`}>
      <Navbar />

      <main className="psm-main">
        <section className="psm-hero">
          <Link to="/persona-playground" className="psm-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="psm-hero__eyebrow">
            <Map aria-hidden="true" /> Sitemap
          </p>
          <h1
            id="psm-title"
            ref={headingRef}
            tabIndex={-1}
            className="psm-hero__title"
          >
            <span>Every page</span>
            <span className="psm-hero__title-accent">in the playground.</span>
          </h1>
          <p className="psm-hero__lede">
            A table of contents for the persona playground — {PERSONA_PLAYGROUND_SITEMAP.length} public pages,
            each with a one-line description. Use this as a quick map of every deep-link
            surface the hub has.
          </p>
          <p className="psm-hero__shortcut-hint">
            <kbd className="psm-hero__kbd" aria-hidden="true">Shift + P</kbd>
            <span>Press this shortcut on the hub to jump back here.</span>
          </p>
        </section>

        <PersonaPlaygroundStats compact />

        <RandomToolButton label="Try a random tool" />

        <CompareFromCategoryButton label="Compare two from a category" />

        <Reveal as="section" className="psm-grid-wrap" aria-label="All pages">
          <ul className="psm-grid">
            {PERSONA_PLAYGROUND_SITEMAP.map((entry) => (
              <li key={entry.path} className="psm-card">
                <Link
                  to={entry.path}
                  className="psm-card__link"
                  style={{ ['--psm-accent' as string]: entry.accent } as React.CSSProperties}
                >
                  <span className="psm-card__stripe" aria-hidden="true" />
                  <span className="psm-card__body">
                    <h2 className="psm-card__title">{entry.title}</h2>
                    <p className="psm-card__path">{entry.path}</p>
                    <p className="psm-card__desc">{entry.description}</p>
                  </span>
                  <ArrowRight aria-hidden="true" className="psm-card__arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
