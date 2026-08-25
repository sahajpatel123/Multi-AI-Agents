import { describe, expect, it } from 'vitest';
import { formatAgentReportApa } from './agentReportApa';
import { formatAgentReportBibtex } from './agentReportBibtex';
import { formatAgentReportChicago } from './agentReportChicago';
import { formatAgentReportCitationBundle } from './agentReportCitationBundle';
import { formatAgentReportIeee } from './agentReportIeee';
import { formatAgentReportMla } from './agentReportMla';

const sharedOpts = {
  title: 'Shareable research',
  question: 'Is this report shareable?',
  url: 'https://arena.example/share/agent/public-report?utm_source=bundle#draft',
  sharedAt: '2026-08-14T11:00:00Z',
};

describe('formatAgentReportCitationBundle', () => {
  it('labels one APA, Chicago, IEEE, and MLA section per report', () => {
    const bundle = formatAgentReportCitationBundle(sharedOpts);

    expect(bundle).toBe(
      [
        'APA\n' + formatAgentReportApa(sharedOpts),
        'Chicago\n' + formatAgentReportChicago(sharedOpts),
        'IEEE\n' + formatAgentReportIeee(sharedOpts),
        'MLA\n' + formatAgentReportMla(sharedOpts),
      ].join('\n'),
    );
    expect(bundle).toContain('APA\nArena. (2026, August 14). Shareable research');
    expect(bundle).toContain('IEEE\nArena, “Shareable research,”');
    expect(bundle).not.toContain('Is this report shareable?');
    expect(bundle).not.toContain('utm_source');
  });

  it('keeps each section identical to the standalone formatter', () => {
    const bundle = formatAgentReportCitationBundle(sharedOpts);
    const sections = bundle.split(/\n(?=APA\n|Chicago\n|IEEE\n|MLA\n)/);

    expect(sections).toHaveLength(4);
    expect(sections[0]).toBe(`APA\n${formatAgentReportApa(sharedOpts)}`);
    expect(sections[1]).toBe(`Chicago\n${formatAgentReportChicago(sharedOpts)}`);
    expect(sections[2]).toBe(`IEEE\n${formatAgentReportIeee(sharedOpts)}`);
    expect(sections[3]).toBe(`MLA\n${formatAgentReportMla(sharedOpts)}`);
  });

  it('never emits reference-manager formats meant for software', () => {
    const bundle = formatAgentReportCitationBundle(sharedOpts);

    expect(bundle).not.toContain('@online{');
    expect(bundle).not.toContain('"type": "webpage"');
    expect(bundle).not.toMatch(new RegExp(formatAgentReportBibtex(sharedOpts).slice(0, 12)));
  });

  it('sanitizes hostile metadata through every included style', () => {
    const bundle = formatAgentReportCitationBundle({
      ...sharedOpts,
      title: 'A‮modereport',
      url: undefined,
      sharedAt: 'not-a-date',
    });

    expect(bundle).not.toMatch(/[\u061c\u200b\u200e\u200f\u202a-\u202e]/);
    expect(bundle.match(/A mode report/g)).toHaveLength(4);
  });
});
