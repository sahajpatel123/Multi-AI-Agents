import { describe, expect, it } from 'vitest';
import { formatAgentReportCslJson } from './agentReportCslJson';

describe('formatAgentReportCslJson', () => {
  it('emits a reference-manager item with public provenance only', () => {
    const value = JSON.parse(
      formatAgentReportCslJson({
        title: 'Research brief',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    );

    expect(value).toEqual([
      {
        type: 'webpage',
        author: [{ literal: 'Arena' }],
        title: 'Research brief',
        'container-title': 'Arena Agent report',
        publisher: 'Arena',
        note: 'Arena Agent report. Question: What should we verify first?',
        issued: { 'date-parts': [[2026, 8, 14]] },
        URL: 'https://arena.example/share/agent/public-token',
      },
    ]);
  });

  it('flattens metadata and omits unsafe URLs or impossible dates', () => {
    const value = formatAgentReportCslJson({
      title: 'A report\nwith a second line',
      question: 'Can this\r\nadd a fake tag?',
      url: 'javascript:alert(1)',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(value).toContain('"title": "A report with a second line"');
    expect(value).toContain('Arena Agent report. Question: Can this add a fake tag?');
    expect(value).not.toContain('javascript:');
    expect(value).not.toContain('"issued"');
    expect(value).not.toContain('fake tag?\n');
  });

  it('omits credential-bearing URLs', () => {
    const value = formatAgentReportCslJson({
      title: 'Private URL',
      url: 'https://user:secret@arena.example/share/agent/public-token',
    });

    expect(value).not.toContain('secret');
    expect(value).not.toContain('"URL"');
  });
});
