import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { prefersReducedMotion } from '../lib/motion';
import { WHATS_NEW, PERSONA_PATH_PREFIX } from '../data/personaPlayground';
import '../styles/persona-whatsnew-page.css';

/**
 * Defense-in-depth: even though the data layer pins every
 * WHATS_NEW link to start with `/persona-` (see personaPlayground
 * test "optional links start with /persona-"), the render site
 * also rejects anything else. A future entry that bypasses the
 * data test — or a hot-patch that adds a malformed link at
 * runtime — can't smuggle a `javascript:` / protocol-relative
 * target into the Link `to=`.
 */
function isSafeLink(link: string | undefined): link is string {
  return typeof link === 'string' && link.startsWith(PERSONA_PATH_PREFIX);
}

export function PersonaPlaygroundWhatsNewPage() {
  const [pageVisible, setPageVisible] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  // Focus the heading on arrival so screen-reader / keyboard users land
  // on the page title (not the body) when Shift+W navigates them here.
  // Same pattern as the categories page (cycle 471): only refocus when
  // the user is arriving fresh, never steal focus from a link click.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active && active !== document.body && active.tagName !== 'HTML') return;
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={`pwn-page${pageVisible ? ' pwn-page--enter' : ''}`}>
      <Navbar />

      <main className="pwn-main">
        <section className="pwn-hero">
          <Link to="/persona-playground" className="pwn-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="pwn-hero__eyebrow">
            <Sparkles aria-hidden="true" /> What's new
          </p>
          <h1
            id="pwn-title"
            ref={headingRef}
            tabIndex={-1}
            className="pwn-hero__title"
          >
            <span>Recent improvements</span>
            <span className="pwn-hero__title-accent">to the playground.</span>
          </h1>
          <p className="pwn-hero__lede">
            A curated changelog of the features that have landed in the persona playground —
            the hub itself, compare, matchups, favorites, daily streak, and more.
          </p>
          <p className="pwn-hero__shortcut-hint">
            <kbd className="pwn-hero__kbd" aria-hidden="true">Shift + W</kbd>
            <span>Press this shortcut on the hub to jump back here.</span>
          </p>
        </section>

        <Reveal as="section" className="pwn-timeline" aria-label="Changelog">
          <ol className="pwn-timeline__list">
            {WHATS_NEW.map((entry) => (
              <li key={`${entry.date}-${entry.title}`} className="pwn-entry">
                <div className="pwn-entry__date" aria-label={`Shipped on ${entry.date}`}>
                  {entry.date}
                </div>
                <div className="pwn-entry__body">
                  <h2 className="pwn-entry__title">{entry.title}</h2>
                  <p className="pwn-entry__summary">{entry.summary}</p>
                  {isSafeLink(entry.link) && (
                    <Link to={entry.link} className="pwn-entry__link">
                      Open the surface
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
