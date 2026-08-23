import { describe, expect, it } from 'vitest';
import { formatMemorySelectionCsv } from './memoryExport';
import type { MemorySummary } from '../types';

const summary: MemorySummary = {
  id: 7,
  session_id: 'session-7',
  dominant_category: 'decision',
  preferred_depth: 'deep',
  trusted_persona: 'analyst',
  exchange_count: 4,
  raw_exchanges_count: 4,
  main_topics: ['IPO, notes', 'Long-term thesis'],
  compressed_at: '2026-08-16T10:00:00Z',
  created_at: '2026-08-16T09:00:00Z',
  session_summary: 'A quoted, multi-line summary',
  key_positions_taken: [
    { persona_id: 'analyst', topic: 'IPO', stance: 'Cautious', confidence: 82 },
  ],
};

describe('formatMemorySelectionCsv', () => {
  it('renders the full selected-summary schema with spreadsheet-friendly rows', () => {
    const csv = formatMemorySelectionCsv([summary]);

    expect(csv.startsWith('\uFEFF"id","session_id"')).toBe(true);
    expect(csv).toContain('"7","session-7"');
    expect(csv).toContain('"IPO, notes; Long-term thesis"');
    expect(csv).toContain('"A quoted, multi-line summary"');
    expect(csv).toContain('"key_positions_taken"');
    expect(csv).toMatch(/\r\n$/);
  });

  it('neutralizes formula-like summary content, including leading whitespace', () => {
    const csv = formatMemorySelectionCsv([
      { ...summary, session_summary: '  =HYPERLINK("https://evil.test")' },
    ]);

    expect(csv).toContain('"\'  =HYPERLINK(""https://evil.test"")"');
  });

  it('still emits a stable header for an empty selection', () => {
    const csv = formatMemorySelectionCsv([]);

    expect(csv).toContain('"id","session_id","dominant_category"');
    expect(csv).toMatch(/\r\n$/);
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
