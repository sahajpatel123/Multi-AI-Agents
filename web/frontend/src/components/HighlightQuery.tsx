import type { CSSProperties } from 'react';
import { splitBySearchQuery } from '../lib/highlightSearch';

type HighlightQueryProps = {
  text: string;
  query: string;
  /** Optional mark styles layered on the default Arena gold wash. */
  markStyle?: CSSProperties;
  /** Extra class on each <mark> (defaults include highlight-query-mark). */
  markClassName?: string;
  /** When true, the search is case-sensitive. Default false. */
  caseSensitive?: boolean;
  /**
   * When true, split the query on whitespace and highlight each term
   * independently. Lets the user search "quantum computing" and see
   * both words highlighted as separate marks. Default false.
   */
  multiTerm?: boolean;
};

/**
 * Render `text` with `query` matches wrapped in <mark>.
 * When query is empty, returns plain text (no extra wrappers).
 *
 * Default behavior: case-insensitive whole-phrase match — what users
 * expect when typing into a sidebar filter. Opt into case-sensitive
 * (rare; technical content) or multi-term (every distinct word
 * highlighted) via props.
 */
export function HighlightQuery({
  text,
  query,
  markStyle,
  markClassName = '',
  caseSensitive = false,
  multiTerm = false,
}: HighlightQueryProps) {
  const q = (query || '').trim();
  if (!q) return <>{text}</>;

  const segments = splitBySearchQuery(text, q, { caseSensitive, multiTerm });
  if (segments.length === 0) return null;
  if (segments.length === 1 && !segments[0].match) return <>{text}</>;

  const markClass = ['highlight-query-mark', markClassName].filter(Boolean).join(' ');

  return (
    <span className="highlight-query">
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className={markClass} style={markStyle}>
            {seg.text}
          </mark>
        ) : (
          <span key={i} className="highlight-query-plain">
            {seg.text}
          </span>
        ),
      )}
    </span>
  );
}
