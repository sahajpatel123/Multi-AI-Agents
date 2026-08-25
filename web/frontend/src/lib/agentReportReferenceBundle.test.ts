import { describe, expect, it } from 'vitest';
import { formatAgentReportBibtex } from './agentReportBibtex';
import { formatAgentReportCslJson } from './agentReportCslJson';
import { formatAgentReportEndnote } from './agentReportEndnote';
import { formatAgentReportReferenceBundle } from './agentReportReferenceBundle';
import { formatAgentReportRis } from './agentReportRis';

const sharedOpts = {
  title: 'Shareable research',
  question: 'Is this report shareable?',
  url: 'https://arena.example/share/agent/public-report?utm_source=bundle#draft',
  sharedAt: '2026-08-14T11:00:00Z',
};

describe('formatAgentReportReferenceBundle', () => {
  it('labels each supported reference-manager format', () => {
    const bundle = formatAgentReportReferenceBundle(sharedOpts);

    expect(bundle).toBe(
      [
        'BibTeX\n' + formatAgentReportBibtex(sharedOpts),
        'RIS\n' + formatAgentReportRis(sharedOpts),
        'CSL-JSON\n' + formatAgentReportCslJson(sharedOpts),
        'EndNote XML\n' + formatAgentReportEndnote(sharedOpts),
      ].join('\n'),
    );
    expect(bundle).toContain('BibTeX\n@online{');
    expect(bundle).toContain('RIS\nTY  - ELEC');
    expect(bundle).toContain('CSL-JSON\n[\n');
    expect(bundle).toContain('EndNote XML\n<?xml version="1.0" encoding="UTF-8"?>');
    expect(bundle).not.toContain('utm_source');
    expect(bundle).toContain('Question: Is this report shareable?');
    expect(bundle).not.toContain('Yes, with a token and a public page.');
  });

  it('keeps hostile metadata sanitized in every section', () => {
    const bundle = formatAgentReportReferenceBundle({
      ...sharedOpts,
      title: 'A‮mode\u0007report',
      url: undefined,
      sharedAt: '2026-02-30T11:00:00Z',
    });

    expect(bundle).not.toMatch(/[\u061c\u200b\u200e\u200f\u202a-\u202e]/);
    expect(
      [...bundle].some((character) => {
        const codePoint = character.charCodeAt(0);
        return (codePoint >= 0 && codePoint <= 8) || codePoint === 11 || codePoint === 12 || (codePoint >= 14 && codePoint <= 31) || codePoint === 127;
      }),
    ).toBe(false);
    expect(bundle.match(/A mode report/g)).toHaveLength(4);
    expect(bundle).not.toContain('year = {2026}');
    expect(bundle).not.toContain('date = {2026-02-30}');
    expect(bundle).not.toContain('PY  - 2026');
    expect(bundle).not.toContain('"issued"');
    expect(bundle).not.toContain('<year>2026</year>');
    expect(bundle.endsWith('\n')).toBe(true);
    expect(bundle).not.toMatch(/\n{3,}/);
  });
});
