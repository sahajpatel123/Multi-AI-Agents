import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ListOrdered } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { prefersReducedMotion } from '../lib/motion';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  personaPlaygroundCategoryLabel,
} from '../data/personaPlayground';
import '../styles/persona-index-page.css';

export function PersonaPlaygroundIndexPage() {
  const [pageVisible, setPageVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
  }, []);

  const sorted = useMemo(
    () =>
      [...PERSONA_PLAYGROUND_ENTRIES].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [],
  );

  // Group by first letter for a sectioned list.
  const groups = useMemo(() => {
    const map = new Map<string, typeof sorted>();
    for (const entry of sorted) {
      const letter = entry.name.replace(/^The\s+/i, '').charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [sorted]);

  return (
    <div className={`pidx-page${pageVisible ? ' pidx-page--enter' : ''}`}>
      <Navbar />

      <main className="pidx-main">
        <section className="pidx-hero">
          <Link to="/persona-playground" className="pidx-hero__back">
            <ArrowLeft aria-hidden="true" />
            <span>Back to the hub</span>
          </Link>
          <p className="pidx-hero__eyebrow">
            <ListOrdered aria-hidden="true" /> All tools (A–Z)
          </p>
          <h1 id="pidx-title" className="pidx-hero__title">
            <span>Every Arena tool,</span>
            <span className="pidx-hero__title-accent">in one list.</span>
          </h1>
          <p className="pidx-hero__lede">
            All 27 tools from the playground, alphabetized and grouped by first letter.
            Use this as a quick reference — each row is a deep-link to the tool.
          </p>
        </section>

        <Reveal as="section" className="pidx-list-wrap" aria-label="All tools A to Z">
          {groups.map(([letter, entries]) => (
            <div key={letter} className="pidx-section">
              <h2 className="pidx-section__letter" aria-label={`Letter ${letter}`}>
                {letter}
              </h2>
              <ul className="pidx-section__list">
                {entries.map((entry) => (
                  <li key={entry.path} className="pidx-row">
                    <Link to={entry.path} className="pidx-row__link">
                      <span className="pidx-row__name">{entry.name}</span>
                      <span className="pidx-row__format">{entry.format}</span>
                      <span className="pidx-row__cat">
                        {personaPlaygroundCategoryLabel(entry.category)}
                      </span>
                      <ArrowRight aria-hidden="true" className="pidx-row__arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>

        <Reveal as="section" className="pidx-fallback" aria-label="See the hub">
          <p className="pidx-fallback__copy">
            Want the visual grid with search and filters? The hub is the front door.
          </p>
          <Link to="/persona-playground" className="pidx-fallback__cta">
            Open the full playground
            <ArrowRight aria-hidden="true" />
          </Link>
        </Reveal>
      </main>

      <Footer />
    </div>
  );
}
