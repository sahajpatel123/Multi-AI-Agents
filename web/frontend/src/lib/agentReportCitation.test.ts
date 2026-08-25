import { describe, expect, it } from 'vitest';
import { formatAgentReportCitation } from './agentReportCitation';

describe('formatAgentReportCitation', () => {
  it('includes provenance in a compact Markdown citation', () => {
    expect(
      formatAgentReportCitation({
        title: 'Research [brief]',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      '[Research \\[brief\\]](https://arena.example/share/agent/public-token) — Arena Agent report.\n' +
        'Question: What should we verify first?\n' +
        'Shared: 2026-08-14\n',
    );
  });

  it('falls back to plain text for an unavailable or unsafe URL', () => {
    expect(
      formatAgentReportCitation({
        question: 'A report without a title',
        url: 'javascript:alert(1)',
      }),
    ).toBe('**A report without a title** — Arena Agent report.\n');
  });
});
