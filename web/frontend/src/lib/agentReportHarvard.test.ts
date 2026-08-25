import { describe, expect, it } from 'vitest';
import { formatAgentReportHarvard } from './agentReportHarvard';

describe('formatAgentReportHarvard', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportHarvard({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena (2026) ‘Shareable research’, Arena Agent report. Available at: ' +
        'https://arena.example/share/agent/public-report (Accessed: 14 August 2026).\n',
    );
    expect(result).not.toContain('Is this report shareable?');
  });

  it('uses n.d. and omits access metadata when the date is invalid', () => {
    const result = formatAgentReportHarvard({
      title: 'A report in progress,',
      url: 'https://arena.example/share/agent/public-report',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe(
      'Arena (n.d.) ‘A report in progress,’ Arena Agent report. Available at: ' +
        'https://arena.example/share/agent/public-report.\n',
    );
  });

  it('flattens hostile metadata and omits invalid URLs', () => {
    const result = formatAgentReportHarvard({
      title: "A 'useful'\nreport",
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: 'not-a-date',
    });

    expect(result).toBe('Arena (n.d.) ‘A ’useful’ report’, Arena Agent report.\n');
    expect(result).not.toContain('javascript:');
  });

  it('removes invisible directional marks and rejects credential-bearing URLs', () => {
    const result = formatAgentReportHarvard({
      title: 'A\u202Emode report',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena (n.d.) ‘A mode report’, Arena Agent report.\n');
    expect(result).not.toContain('secret');
    expect(result).not.toMatch(/[\u202a-\u202e]/);
  });
});
