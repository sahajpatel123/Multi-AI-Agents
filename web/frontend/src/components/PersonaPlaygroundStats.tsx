import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import {
  PERSONA_PLAYGROUND_ENTRIES,
  MATCHUPS,
  PERSONA_PLAYGROUND_SITEMAP,
} from '../data/personaPlayground';

export interface PersonaPlaygroundStatsProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Hide the heading eyebrow (e.g. when embedded in a CTA banner). */
  compact?: boolean;
}

interface StatItem {
  readonly label: string;
  readonly value: number | string;
  readonly link?: string;
  readonly accent: string;
}

export function PersonaPlaygroundStats({
  heading = 'Playground at a glance',
  compact = false,
}: PersonaPlaygroundStatsProps) {
  const categoryCount = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.category))
    .size;
  const formatCount = new Set(PERSONA_PLAYGROUND_ENTRIES.map((e) => e.format)).size;

  const items: readonly StatItem[] = [
    {
      label: 'tools',
      value: PERSONA_PLAYGROUND_ENTRIES.length,
      link: '/persona-playground',
      accent: '#c8b9ff',
    },
    {
      label: 'categories',
      value: categoryCount,
      link: '/persona-playground/categories',
      accent: '#8aa3ff',
    },
    {
      label: 'formats',
      value: formatCount,
      link: '/persona-playground/formats',
      accent: '#ffa756',
    },
    {
      label: 'curated matchups',
      value: MATCHUPS.length,
      link: '/persona-playground',
      accent: '#c8b9ff',
    },
    {
      label: 'deep-link pages',
      value: PERSONA_PLAYGROUND_SITEMAP.length,
      link: '/persona-playground/sitemap',
      accent: '#f1e9d8',
    },
  ];

  return (
    <section className="ppg-stats" aria-label={heading}>
      {!compact && (
        <p className="ppg-stats__eyebrow">
          <BarChart3 aria-hidden="true" /> {heading}
        </p>
      )}
      <ul className="ppg-stats__list">
        {items.map((item) => {
          const body = (
            <>
              <span
                className="ppg-stats__value"
                style={{ ['--ppg-stats-accent' as string]: item.accent } as React.CSSProperties}
              >
                {item.value}
              </span>
              <span className="ppg-stats__label">{item.label}</span>
            </>
          );
          return (
            <li key={item.label} className="ppg-stats__item">
              {item.link ? (
                <Link to={item.link} className="ppg-stats__link">
                  {body}
                </Link>
              ) : (
                <span className="ppg-stats__link ppg-stats__link--plain">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
