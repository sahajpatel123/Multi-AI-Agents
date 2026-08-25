import { describe, expect, it } from 'vitest';
import { formatAgentReportRis } from './agentReportRis';

describe('formatAgentReportRis', () => {
  it('includes public provenance without the report body', () => {
    expect(
      formatAgentReportRis({
        title: 'Research brief',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      'TY  - ELEC\n' +
        'AU  - Arena\n' +
        'TI  - Research brief\n' +
        'T2  - Arena Agent report\n' +
        'PB  - Arena\n' +
        'PY  - 2026\n' +
        'DA  - 2026/08/14\n' +
        'UR  - https://arena.example/share/agent/public-token\n' +
        'N1  - Arena Agent report. Question: What should we verify first?\n' +
        'ER  - \n',
    );
  });

  it('flattens line-oriented fields and rejects unsafe URLs', () => {
    const ris = formatAgentReportRis({
      title: 'A report\nwith a second line',
      question: 'Can this\r\nadd a fake tag?',
      url: 'javascript:alert(1)',
    });

    expect(ris).toContain('TI  - A report with a second line');
    expect(ris).toContain('N1  - Arena Agent report. Question: Can this add a fake tag?');
    expect(ris).not.toContain('javascript:');
    expect(ris).not.toContain('\nFAKE  -');
    expect(ris).toContain('TY  - ELEC\n');
  });

  it('omits credential-bearing URLs', () => {
    const ris = formatAgentReportRis({
      title: 'Private URL',
      url: 'https://user:secret@arena.example/share/agent/public-token',
    });

    expect(ris).not.toContain('secret');
    expect(ris).not.toContain('UR  -');
  });

  it('strips tracking parameters and fragments from public URLs', () => {
    const ris = formatAgentReportRis({
      title: 'Stable URL',
      url: 'https://arena.example/share/agent/public-token?utm_source=copy&session=private#draft',
    });

    expect(ris).toContain('UR  - https://arena.example/share/agent/public-token');
    expect(ris).not.toContain('utm_source');
    expect(ris).not.toContain('session=private');
    expect(ris).not.toContain('#draft');
  });

  it('omits impossible shared dates instead of emitting misleading metadata', () => {
    const ris = formatAgentReportRis({
      title: 'Undated report',
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(ris).not.toContain('PY  -');
    expect(ris).not.toContain('DA  -');
    expect(ris).toContain('N1  - Arena Agent report.');
    expect(ris.endsWith('ER  - \n')).toBe(true);
  });
});
