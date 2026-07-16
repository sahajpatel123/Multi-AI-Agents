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
});

describe('searchHighlightUseful', () => {
  it('is true only when text contains the query', () => {
    expect(searchHighlightUseful('Ship today', 'ship')).toBe(true);
    expect(searchHighlightUseful('Ship today', 'quantum')).toBe(false);
    expect(searchHighlightUseful('Ship', '')).toBe(false);
  });
});
