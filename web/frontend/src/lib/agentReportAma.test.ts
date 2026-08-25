import { describe, expect, it } from 'vitest';
import { formatAgentReportAma } from './agentReportAma';

describe('formatAgentReportAma', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportAma({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena. Shareable research. Arena Agent report [Internet]. Published 2026 Aug 14. ' +
        'Available from: https://arena.example/share/agent/public-report\n',
    );
    expect(result).not.toContain('Is this report shareable?');
  });

  it('omits invalid dates and URLs without leaking unsafe metadata', () => {
    const result = formatAgentReportAma({
      title: 'A "useful"\nreport',
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe('Arena. A "useful" report. Arena Agent report [Internet].\n');
    expect(result).not.toContain('javascript:');
  });

  it('removes invisible directional marks and rejects credential-bearing URLs', () => {
    const result = formatAgentReportAma({
      title: 'A\u202Emode report',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena. A mode report. Arena Agent report [Internet].\n');
    expect(result).not.toContain('secret');
    expect(result).not.toMatch(/[\u202a-\u202e]/);
  });

  it.each(['Why?', 'Stop!', 'A report in progress,'])('preserves terminal punctuation for %j', (title) => {
    expect(formatAgentReportAma({ title })).toBe(
      `Arena. ${title} Arena Agent report [Internet].\n`,
    );
  });
});
