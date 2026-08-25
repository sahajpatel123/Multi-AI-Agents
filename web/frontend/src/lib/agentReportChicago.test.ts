import { describe, expect, it } from 'vitest';
import { formatAgentReportChicago } from './agentReportChicago';

describe('formatAgentReportChicago', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportChicago({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena. “Shareable research.” Arena Agent report. August 14, 2026. ' +
        'https://arena.example/share/agent/public-report.\n',
    );
    expect(result).not.toContain('Is this report shareable?');
  });

  it('does not duplicate terminal punctuation and removes unsafe metadata', () => {
    const result = formatAgentReportChicago({
      title: 'A "useful"\nreport?',
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe('Arena. “A ‘useful’ report?” Arena Agent report.\n');
    expect(result).not.toContain('javascript:');
  });

  it('keeps multiple nested quote pairs typographically balanced', () => {
    expect(
      formatAgentReportChicago({
        title: 'The "first" and “second” finding',
      }),
    ).toBe('Arena. “The ‘first’ and ‘second’ finding.” Arena Agent report.\n');
  });

  it('rejects credential-bearing URLs and falls back to the question', () => {
    const result = formatAgentReportChicago({
      title: null,
      question: 'A report without a title',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena. “A report without a title.” Arena Agent report.\n');
    expect(result).not.toContain('secret');
  });

  it('removes invisible directional controls from user-authored text', () => {
    expect(
      formatAgentReportChicago({
        title: 'A\u202E misleading\u2066 title',
        sharedAt: '2026-08-14T11:00:00',
      }),
    ).toBe('Arena. “A misleading title.” Arena Agent report. August 14, 2026.\n');
  });
});
