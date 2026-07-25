import { Link } from 'react-router-dom';
import { ArrowRight, Swords } from 'lucide-react';
import { MATCHUPS, type Matchup } from '../data/personaPlayground';

export interface MatchupsProps {
  /** Heading shown above the gallery. Defaults to "Curated matchups". */
  heading?: string;
}

/**
 * Gallery of curated persona-tool matchups. Each card deep-links to
 * the compare route with prefilled params so users can share a
 * narrative pair in one click. Renders nothing when MATCHUPS is empty.
 */
export function Matchups({ heading = 'Curated matchups' }: MatchupsProps) {
  if (MATCHUPS.length === 0) return null;
  return (
    <section className="ppg-matchups" aria-label={heading}>
      <header className="ppg-matchups__head">
        <p className="ppg-matchups__eyebrow">
          <Swords aria-hidden="true" /> Matchups
        </p>
        <h2 className="ppg-matchups__heading">{heading}</h2>
        <p className="ppg-matchups__lede">
          Pre-baked comparison pairs with a story. Click any card to open the side-by-side
          view — the URL is shareable, so paste the verdict into chat or save it for later.
        </p>
      </header>
      <ul className="ppg-matchups__grid">
        {MATCHUPS.map((matchup) => (
          <MatchupCard key={matchup.title} matchup={matchup} />
        ))}
      </ul>
    </section>
  );
}

function MatchupCard({ matchup }: { matchup: Matchup }) {
  const href = `/persona-playground/compare?a=${encodeURIComponent(matchup.paths[0])}&b=${encodeURIComponent(matchup.paths[1])}`;
  return (
    <li className="ppg-matchups__card">
      <Link to={href} className="ppg-matchups__link">
        <h3 className="ppg-matchups__title">{matchup.title}</h3>
        <p className="ppg-matchups__summary">{matchup.summary}</p>
        <span className="ppg-matchups__cta">
          Open comparison
          <ArrowRight aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}
