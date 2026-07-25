import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { prefersReducedMotion } from '../lib/motion';
import { WHATS_NEW } from '../data/personaPlayground';
import '../styles/persona-whatsnew-page.css';

export function PersonaPlaygroundWhatsNewPage() {
  const [pageVisible, setPageVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
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
          <h1 id="pwn-title" className="pwn-hero__title">
            <span>Recent improvements</span>
            <span className="pwn-hero__title-accent">to the playground.</span>
          </h1>
          <p className="pwn-hero__lede">
            A curated changelog of the features that have landed in the persona playground —
            the hub itself, compare, matchups, favorites, daily streak, and more.
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
                  {entry.link && (
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
