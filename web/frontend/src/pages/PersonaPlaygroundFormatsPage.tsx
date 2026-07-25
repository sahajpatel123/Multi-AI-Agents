import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Layers } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { prefersReducedMotion } from '../lib/motion';
import { formatSummaries, personaPlaygroundCategoryLabel } from '../data/personaPlayground';
import '../styles/persona-formats-page.css';

export function PersonaPlaygroundFormatsPage() {
  const [pageVisible, setPageVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  const summaries = useMemo(() => formatSummaries(), []);

  return (
    <div className={`pfmt-page${pageVisible ? ' pfmt-page--enter' : ''}`}>
      <Navbar />

      <main className="pfmt-main">
        <section className="pfmt-hero">
          <Link to="/persona-playground" className="pfmt-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="pfmt-hero__eyebrow">
            <Layers aria-hidden="true" /> By format
          </p>
          <h1 id="pfmt-title" className="pfmt-hero__title">
            <span>Tools grouped</span>
            <span className="pfmt-hero__title-accent">by shape.</span>
          </h1>
          <p className="pfmt-hero__lede">
            Every tool has a format — "4-mind panel", "60s sort", "16-mind council". Many
            categories share a format. Browse by shape to find every tool of a particular
            kind, regardless of category.
          </p>
        </section>

        <Reveal as="section" className="pfmt-list-wrap" aria-label="Formats">
          <ul className="pfmt-list">
            {summaries.map((summary) => (
              <li key={summary.format} className="pfmt-card">
                <header className="pfmt-card__head">
                  <h2 className="pfmt-card__format">{summary.format}</h2>
                  <span className="pfmt-card__count">
                    {summary.count} {summary.count === 1 ? 'tool' : 'tools'}
                  </span>
                </header>
                <ul className="pfmt-card__tools">
                  {summary.entries.map((entry) => (
                    <li key={entry.path} className="pfmt-card__tool">
                      <Link to={entry.path} className="pfmt-card__link">
                        <span className="pfmt-card__name">{entry.name}</span>
                        <span className="pfmt-card__cat">
                          {personaPlaygroundCategoryLabel(entry.category)}
                        </span>
                        <ArrowRight aria-hidden="true" className="pfmt-card__arrow" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
