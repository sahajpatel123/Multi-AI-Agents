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
};

/**
 * Render `text` with case-insensitive `query` matches wrapped in <mark>.
 * When query is empty, returns plain text (no extra wrappers).
 */
export function HighlightQuery({ text, query, markStyle }: HighlightQueryProps) {
  const q = (query || '').trim();
  if (!q) return <>{text}</>;

  const segments = splitBySearchQuery(text, q);
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
