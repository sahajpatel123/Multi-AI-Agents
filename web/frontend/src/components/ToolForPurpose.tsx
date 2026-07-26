import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Search, X } from 'lucide-react';
import { matchToolForPurpose } from '../data/personaPlayground';

export interface ToolForPurposeProps {
  /** Heading shown above the input. */
  heading?: string;
  /** Placeholder text. */
  placeholder?: string;
}

/**
 * Tiny "what tool is right for X?" search-by-purpose widget. Renders
 * an input + a Link to the best-match catalog entry. Updates on each
 * keystroke. Renders nothing until the user has typed something
 * that matches a catalog entry.
 */
export function ToolForPurpose({
  heading = 'What tool is right for X?',
  placeholder = 'e.g. "compare two", "fastest", "myself"',
}: ToolForPurposeProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const match = useMemo(() => matchToolForPurpose(query), [query]);

  const onClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <section className="ppg-purpose" aria-label={heading}>
      <header className="ppg-purpose__head">
        <p className="ppg-purpose__eyebrow">
          <Compass aria-hidden="true" /> {heading}
        </p>
      </header>
      <div className="ppg-purpose__input">
        <Search aria-hidden="true" className="ppg-purpose__icon" />
        <input
          ref={inputRef}
          type="search"
          className="ppg-purpose__field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search tools by purpose"
        />
        {query && (
          <button
            type="button"
            className="ppg-purpose__clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {match && (
        <Link to={match.path} className="ppg-purpose__match" aria-label={`Open ${match.name}`}>
          <span className="ppg-purpose__match-name">{match.name}</span>
          <span className="ppg-purpose__match-tagline">{match.tagline}</span>
        </Link>
      )}
    </section>
  );
}
