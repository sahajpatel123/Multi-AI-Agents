import type { CSSProperties } from 'react';
import { splitBySearchQuery } from '../lib/highlightSearch';

const DEFAULT_MARK: CSSProperties = {
  background: 'rgba(196, 149, 106, 0.28)',
  color: 'inherit',
  borderRadius: 3,
  padding: '0 1px',
  fontWeight: 500,
};

type HighlightQueryProps = {
  text: string;
  query: string;
  /** Optional mark styles (Arena gold wash by default). */
  markStyle?: CSSProperties;
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
  caseSensitive = false,
  multiTerm = false,
}: HighlightQueryProps) {
  const q = (query || '').trim();
  if (!q) return <>{text}</>;

  const segments = splitBySearchQuery(text, q, { caseSensitive, multiTerm });
  if (segments.length === 0) return null;
  if (segments.length === 1 && !segments[0].match) return <>{text}</>;

  const markSx = markStyle ? { ...DEFAULT_MARK, ...markStyle } : DEFAULT_MARK;

  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} style={markSx}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}