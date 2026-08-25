import { describe, expect, it } from 'vitest';
import { formatAgentReportIeee } from './agentReportIeee';

describe('formatAgentReportIeee', () => {
  it('formats dated public provenance without including the report body', () => {
    const result = formatAgentReportIeee({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report?utm_source=copy#draft',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena, “Shareable research,” Arena Agent report, Aug. 14, 2026. ' +
        '[Online]. Available: https://arena.example/share/agent/public-report\n',
    );
    expect(result).not.toContain('Is this report shareable?');
    // A trailing period after the URL would be misread as part of the address.
    expect(result).not.toMatch(/public-report\.\n$/);
  });

  it('separates the site label from the date with a comma when there is no URL', () => {
    const result = formatAgentReportIeee({
      title: 'Offline research',
      sharedAt: '2026-08-14T11:00:00Z',
    });

    expect(result).toBe(
      'Arena, “Offline research,” Arena Agent report, Aug. 14, 2026. [Online].\n',
    );
  });

  it('flattens hostile metadata and omits invalid URLs and dates', () => {
    const result = formatAgentReportIeee({
      title: 'A "useful"\nreport',
      question: 'Fallback question',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(result).toBe('Arena, “A ‘useful’ report,” Arena Agent report. [Online].\n');
    expect(result).not.toContain('javascript:');
  });

  it('rejects credential-bearing URLs and falls back to the question', () => {
    const result = formatAgentReportIeee({
      title: null,
      question: 'A report without a title',
      url: 'https://user:secret@arena.example/share/agent/public-report',
    });

    expect(result).toBe('Arena, “A report without a title,” Arena Agent report. [Online].\n');
    expect(result).not.toContain('secret');
  });

  it.each(['Why now?', 'Stop!', 'A finished report.'])(
    'does not duplicate terminal punctuation for title %j',
    (title) => {
      expect(
        formatAgentReportIeee({
          title,
          url: 'https://arena.example/share/agent/public-report',
        }),
      ).toBe(`Arena, “${title}” Arena Agent report. [Online]. Available: https://arena.example/share/agent/public-report\n`);
    },
  );
});
