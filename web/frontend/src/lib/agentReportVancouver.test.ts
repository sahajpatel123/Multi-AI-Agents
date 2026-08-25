import { describe, expect, it } from 'vitest';
import { formatAgentReportVancouver } from './agentReportVancouver';

describe('formatAgentReportVancouver', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportVancouver({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena. Shareable research. [Internet]. Arena Agent report; 2026 Aug 14. ' +
        'Available from: https://arena.example/share/agent/public-report\n',
    );
    expect(result).not.toContain('Is this report shareable?');
  });

  it('does not duplicate terminal title punctuation', () => {
    expect(
      formatAgentReportVancouver({
        title: 'A report in progress.',
        url: 'https://arena.example/share/agent/public-report',
      }),
    ).toBe(
      'Arena. A report in progress. [Internet]. Arena Agent report. ' +
        'Available from: https://arena.example/share/agent/public-report\n',
    );
  });

  it('does not create a comma-period sequence for comma-ended titles', () => {
    expect(
      formatAgentReportVancouver({
        title: 'A report in progress,',
        url: 'https://arena.example/share/agent/public-report',
      }),
    ).toBe(
      'Arena. A report in progress, [Internet]. Arena Agent report. ' +
        'Available from: https://arena.example/share/agent/public-report\n',
    );
  });

  it('flattens hostile metadata and omits invalid URLs and dates', () => {
    const result = formatAgentReportVancouver({
      title: 'A "useful"\nreport',
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe('Arena. A "useful" report. [Internet]. Arena Agent report.\n');
    expect(result).not.toContain('javascript:');
  });

  it('removes invisible directional marks from titles', () => {
    const result = formatAgentReportVancouver({ title: 'A\u202Emode report' });

    expect(result).toContain('A mode report.');
    expect(result).not.toMatch(/[\u061c\u200b\u200e\u200f\u202a-\u202e]/);
  });

  it('rejects credential-bearing URLs and falls back to the question', () => {
    const result = formatAgentReportVancouver({
      title: null,
      question: 'A report without a title',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena. A report without a title. [Internet]. Arena Agent report.\n');
    expect(result).not.toContain('secret');
  });

  it.each(['Why?', 'Stop!'])('preserves terminal punctuation for title %j', (title) => {
    expect(formatAgentReportVancouver({ title })).toBe(
      `Arena. ${title} [Internet]. Arena Agent report.\n`,
    );
  });
});
