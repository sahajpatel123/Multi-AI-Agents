import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Map } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { PersonaPlaygroundStats } from '../components/PersonaPlaygroundStats';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-sitemap-page.css';

interface SitemapEntry {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  /** Visual accent for the card top-stripe. */
  readonly accent: string;
}

const SITEMAP: readonly SitemapEntry[] = [
  {
    path: '/persona-playground',
    title: 'Hub',
    description:
      'The single front door for all 27 tools — search, filter, daily featured, recent tools, recent comparisons, recent shares, favorites, unvisited tools, curated matchups, and compare CTA.',
    accent: '#c8b9ff',
  },
  {
    path: '/persona-playground/compare',
    title: 'Compare any two tools',
    description:
      'Render two tools side-by-side from a ?a=…&b=… query string. Copy the share URL with one click.',
    accent: '#c8b9ff',
  },
  {
    path: '/persona-playground/categories',
    title: 'Browse by category',
    description:
      'Seven categories — Discover, Versus, Council, Roast, Decide, Forecast, Mosaic — each with a tool count and a one-line description.',
    accent: '#8aa3ff',
  },
  {
    path: '/persona-playground/formats',
    title: 'Browse by format',
    description:
      'Group every tool by its freeform format string (4-mind panel, 60s sort, etc.) — different aggregation than category.',
    accent: '#ffa756',
  },
  {
    path: '/persona-playground/favorites',
    title: 'Your favorites',
    description:
      'The tools you starred from the hub. Local-only, so the list never leaves your browser.',
    accent: '#ffd86b',
  },
  {
    path: '/persona-playground/index',
    title: 'A-Z tool index',
    description:
      'Alphabetical reference list of all 27 tools with format and category, grouped by first letter.',
    accent: '#c8b9ff',
  },
  {
    path: '/persona-playground/whats-new',
    title: "What's new",
    description:
      'A curated changelog of recent playground improvements — every new feature surfaces here for returning visitors.',
    accent: '#9be3c2',
  },
  {
    path: '/persona-playground/sitemap',
    title: 'Sitemap',
    description:
      'This page — a table of contents for every public persona-playground route.',
    accent: '#f1e9d8',
  },
];

export function PersonaPlaygroundSitemapPage() {
  const [pageVisible, setPageVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = prefersReducedMotion();
    const id = window.setTimeout(() => setPageVisible(true), reduceMotion ? 0 : 80);
    return () => window.clearTimeout(id);
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
          <h1 id="psm-title" className="psm-hero__title">
            <span>Every page</span>
            <span className="psm-hero__title-accent">in the playground.</span>
          </h1>
          <p className="psm-hero__lede">
            A table of contents for the persona playground — {SITEMAP.length} public pages,
            each with a one-line description. Use this as a quick map of every deep-link
            surface the hub has.
          </p>
        </section>

        <PersonaPlaygroundStats compact />

        <Reveal as="section" className="psm-grid-wrap" aria-label="All pages">
          <ul className="psm-grid">
            {SITEMAP.map((entry) => (
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
