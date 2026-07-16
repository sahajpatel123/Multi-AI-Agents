import { describe, expect, it } from 'vitest';
import {
  buildPerspectiveRows,
  extractPerspectiveKeywords,
  formatConfidenceScore,
  formatPerspectiveComparisonMarkdown,
} from './perspectiveComparison';

describe('perspectiveComparison', () => {
  it('extracts keywords and drops stop words', () => {
    const keys = extractPerspectiveKeywords('This would create lasting market pressure overnight');
    expect(keys).toContain('create');
    expect(keys).toContain('lasting');
    expect(keys).toContain('market');
    expect(keys).not.toContain('this');
    expect(keys).not.toContain('would');
  });

  it('normalizes confidence 0–1 and 0–100', () => {
    expect(formatConfidenceScore(0.72)).toBe('72');
    expect(formatConfidenceScore(88)).toBe('88');
    expect(formatConfidenceScore(null)).toBeNull();
  });

  it('builds rows and markdown export', () => {
    const rows = buildPerspectiveRows([
      {
        agentId: 'agent_1',
        name: 'The Analyst',
        color: '#8C9BAB',
        oneLiner: 'Stress-test the cash runway before expanding.',
        score: 91,
        confidence: 0.8,
        isWinner: true,
      },
    ]);
    expect(rows[0].name).toBe('The Analyst');
    expect(rows[0].scoreLabel).toBe('91');
    expect(rows[0].confidenceLabel).toBe('80');
    expect(rows[0].keywords.length).toBeGreaterThan(0);

    const md = formatPerspectiveComparisonMarkdown({
      question: 'Should we expand?',
      rows,
    });
    expect(md).toContain('# Arena perspective comparison');
    expect(md).toContain('Should we expand?');
    expect(md).toContain('The Analyst');
    expect(md).toContain('winner');
  });
});
