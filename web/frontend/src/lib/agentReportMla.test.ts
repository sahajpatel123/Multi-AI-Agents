import { describe, expect, it } from 'vitest';
import { formatAgentReportMla } from './agentReportMla';

describe('formatAgentReportMla', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportMla({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena. “Shareable research.” Arena Agent report, 14 Aug. 2026, ' +
        'https://arena.example/share/agent/public-report.\n',
    );
    expect(result).not.toContain('Is this report shareable?');
  });

  it('flattens hostile title text and omits invalid metadata', () => {
    const result = formatAgentReportMla({
      title: 'A "useful"\nreport',
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe('Arena. “A ’useful’ report.” Arena Agent report.\n');
    expect(result).not.toContain('javascript:');
  });

  it('removes invisible directional marks from titles', () => {
    const result = formatAgentReportMla({ title: 'A‮mode report' });

    expect(result).toContain('“A mode report.”');
    expect(result).not.toMatch(/[\u202a-\u202e]/);
  });

  it('rejects credential-bearing URLs and falls back to the question', () => {
    const result = formatAgentReportMla({
      title: null,
      question: 'A report without a title',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena. “A report without a title.” Arena Agent report.\n');
    expect(result).not.toContain('secret');
  });

  it.each(['Why now?', 'Stop!', 'A finished report.'])(
    'does not duplicate terminal punctuation for title %j',
    (title) => {
      expect(
        formatAgentReportMla({
          title,
          url: 'https://arena.example/share/agent/public-report',
        }),
      ).toBe(`Arena. “${title}” Arena Agent report, https://arena.example/share/agent/public-report.\n`);
    },
  );
});
