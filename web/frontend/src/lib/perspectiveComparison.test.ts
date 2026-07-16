import { describe, expect, it } from 'vitest';
import {
  buildPerspectiveRows,
  extractPerspectiveKeywords,
  formatConfidenceScore,
  formatPerspectiveComparisonMarkdown,
  sharedPerspectiveKeywords,
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

  it('marks distinctive vs shared keywords across minds', () => {
    const rows = buildPerspectiveRows([
      {
        agentId: 'a1',
        name: 'Analyst',
        oneLiner: 'Cash runway liquidity stress before expanding markets.',
      },
      {
        agentId: 'a2',
        name: 'Optimist',
        oneLiner: 'Expanding markets reward bold liquidity bets on growth.',
      },
    ]);
    expect(sharedPerspectiveKeywords(rows)).toEqual(
      expect.arrayContaining(['markets', 'liquidity']),
    );
    const analyst = rows.find((r) => r.agentId === 'a1')!;
    const optimist = rows.find((r) => r.agentId === 'a2')!;
    expect(analyst.distinctive).toEqual(expect.arrayContaining(['runway', 'stress']));
    expect(optimist.distinctive).toEqual(expect.arrayContaining(['reward', 'growth']));
    expect(analyst.distinctive).not.toContain('markets');
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
    expect(rows[0].distinctive.length).toBeGreaterThan(0);

    const md = formatPerspectiveComparisonMarkdown({
      question: 'Should we expand?',
      rows,
    });
    expect(md).toContain('# Arena perspective comparison');
    expect(md).toContain('Should we expand?');
    expect(md).toContain('The Analyst');
    expect(md).toContain('winner');
    expect(md).toContain('Distinctive:');
  });

  it('marks canExpand and exports multi-line full takes', () => {
    const rows = buildPerspectiveRows([
      {
        agentId: 'a1',
        name: 'Analyst',
        oneLiner: 'Not yet.',
        fullTake:
          'Not yet.\n\nStage a canary rollout with a kill switch and clear success metrics before full launch.',
      },
    ]);
    expect(rows[0].canExpand).toBe(true);
    expect(rows[0].fullTake).toContain('canary');
    const md = formatPerspectiveComparisonMarkdown({ rows });
    expect(md).toContain('canary rollout');
  });
});
