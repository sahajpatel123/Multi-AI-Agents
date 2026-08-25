import { describe, expect, it } from 'vitest';
import { formatAgentReportApa } from './agentReportApa';

describe('formatAgentReportApa', () => {
  it('formats a dated public report without including its body or private token', () => {
    const result = formatAgentReportApa({
      title: 'Shareable research',
      question: 'Is this report shareable?',
      url: 'https://arena.example/share/agent/public-report',
      sharedAt: '2026-08-14T11:00:00',
    });

    expect(result).toBe(
      'Arena. (2026, August 14). Shareable research [AI-generated research report]. Arena. https://arena.example/share/agent/public-report\n',
    );
    expect(result).not.toContain('Is this report shareable?');
    expect(result).not.toContain('tok_1234567890abcdef');
  });

  it('uses no-date metadata and omits unsafe URLs', () => {
    expect(
      formatAgentReportApa({
        title: 'A\nreport',
        url: 'javascript:alert(1)',
        sharedAt: '2026-02-29T11:00:00',
      }),
    ).toBe('Arena. (n.d.). A report [AI-generated research report]. Arena.\n');
  });

  it('keeps tracking parameters and fragments out of the public URL', () => {
    expect(
      formatAgentReportApa({
        title: 'Stable report',
        url: 'https://arena.example/share/agent/public-report?utm_source=copy&session=private#draft',
      }),
    ).toBe(
      'Arena. (n.d.). Stable report [AI-generated research report]. Arena. ' +
        'https://arena.example/share/agent/public-report\n',
    );
  });

  it('removes invisible directional controls from user-authored text', () => {
    expect(
      formatAgentReportApa({
        title: 'A\u202E misleading\u2066 title',
        sharedAt: '2026-08-14T11:00:00',
      }),
    ).toBe('Arena. (2026, August 14). A misleading title [AI-generated research report]. Arena.\n');
  });
});
