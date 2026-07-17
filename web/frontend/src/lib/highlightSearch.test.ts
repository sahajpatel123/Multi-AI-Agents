import { describe, expect, it } from 'vitest';
import { searchHighlightUseful, splitBySearchQuery } from './highlightSearch';

describe('splitBySearchQuery', () => {
  it('returns plain segment when query empty', () => {
    expect(splitBySearchQuery('Hello world', '')).toEqual([
      { text: 'Hello world', match: false },
    ]);
    expect(splitBySearchQuery('Hello', '   ')).toEqual([{ text: 'Hello', match: false }]);
  });

  it('returns empty for empty text', () => {
    expect(splitBySearchQuery('', 'x')).toEqual([]);
    expect(splitBySearchQuery(null, 'x')).toEqual([]);
  });

  it('highlights case-insensitively and preserves original casing', () => {
    expect(splitBySearchQuery('Quantum Computing Brief', 'quantum')).toEqual([
      { text: 'Quantum', match: true },
      { text: ' Computing Brief', match: false },
    ]);
  });

  it('handles multiple matches', () => {
    expect(splitBySearchQuery('ai and AI research', 'ai')).toEqual([
      { text: 'ai', match: true },
      { text: ' and ', match: false },
      { text: 'AI', match: true },
      { text: ' research', match: false },
    ]);
  });

  it('returns single plain segment when no match', () => {
    expect(splitBySearchQuery('hello', 'xyz')).toEqual([{ text: 'hello', match: false }]);
  });

  it('respects caseSensitive=true (exact case only)', () => {
    const result = splitBySearchQuery('Quantum Computing Brief', 'quantum', {
      caseSensitive: true,
    });
    expect(result).toEqual([{ text: 'Quantum Computing Brief', match: false }]);

    const matched = splitBySearchQuery('Quantum Computing Brief', 'Quantum', {
      caseSensitive: true,
    });
    expect(matched[0]).toEqual({ text: 'Quantum', match: true });
  });

  it('highlights multiple terms when multiTerm=true', () => {
    const result = splitBySearchQuery('quantum computing is fun', 'quantum fun', {
      multiTerm: true,
    });
    expect(result).toEqual([
      { text: 'quantum', match: true },
      { text: ' computing is ', match: false },
      { text: 'fun', match: true },
    ]);
  });

  it('collapses overlapping multi-term matches into one', () => {
    // 'quantum' and 'quantumc' would overlap; alternation is
    // left-to-right, so 'quantum' (the first listed needle) matches
    // first and 'quantumc' is consumed inside it. The result is a
    // single merged mark of the union span.
    const result = splitBySearchQuery('quantumc physics', 'quantum quantumc', {
      multiTerm: true,
    });
    expect(result).toEqual([
      { text: 'quantum', match: true },
      { text: 'c physics', match: false },
    ]);
  });

  it('escapes regex metacharacters in needles', () => {
    const result = splitBySearchQuery('100% effort sprint', '100%', { multiTerm: true });
    expect(result).toEqual([
      { text: '100%', match: true },
      { text: ' effort sprint', match: false },
    ]);
  });

  it('multiTerm ignores whitespace-only terms', () => {
    const result = splitBySearchQuery('quantum stuff', '  quantum  ', {
      multiTerm: true,
    });
    expect(result).toEqual([
      { text: 'quantum', match: true },
      { text: ' stuff', match: false },
    ]);
  });
});

describe('searchHighlightUseful', () => {
  it('is true only when text contains the query', () => {
    expect(searchHighlightUseful('Ship today', 'ship')).toBe(true);
    expect(searchHighlightUseful('Ship today', 'quantum')).toBe(false);
    expect(searchHighlightUseful('Ship', '')).toBe(false);
  });

  it('respects caseSensitive option', () => {
    expect(searchHighlightUseful('Quantum', 'quantum')).toBe(true);
    expect(searchHighlightUseful('Quantum', 'quantum', { caseSensitive: true })).toBe(false);
    expect(searchHighlightUseful('Quantum', 'Quantum', { caseSensitive: true })).toBe(true);
  });
});