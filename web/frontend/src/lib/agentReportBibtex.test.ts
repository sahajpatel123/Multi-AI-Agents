import { describe, expect, it } from 'vitest';
import { formatAgentReportBibtex } from './agentReportBibtex';

describe('formatAgentReportBibtex', () => {
  it('includes public provenance without the report body', () => {
    expect(
      formatAgentReportBibtex({
        title: 'Research brief',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      '@online{arena_research_brief_20260814_0vyxz1t,\n' +
        '  author = {{Arena}},\n' +
        '  title = {Research brief},\n' +
        '  year = {2026},\n' +
        '  date = {2026-08-14},\n' +
        '  url = {https://arena.example/share/agent/public-token},\n' +
        '  note = {Arena Agent report. Question: What should we verify first?},\n' +
        '}\n',
    );
  });

  it('escapes BibTeX syntax and keeps punctuation inside fields', () => {
    const bibtex = formatAgentReportBibtex({
      title: 'A {useful} 100% report_2026',
      question: 'Can $this & that #work? ~yes ^no',
      url: 'https://arena.example/report?q=a&b=1',
    });

    expect(bibtex).toContain('title = {A \\{useful\\} 100\\% report\\_2026},');
    expect(bibtex).toContain(
      'note = {Arena Agent report. Question: Can \\$this \\& that \\#work? \\textasciitilde{}yes \\textasciicircum{}no},',
    );
    expect(bibtex).toContain('url = {https://arena.example/report?q=a\\&b=1},');
  });

  it('omits unsafe URLs and falls back to a misc entry', () => {
    expect(
      formatAgentReportBibtex({
        question: 'A report without a safe URL',
        url: 'javascript:alert(1)',
      }),
    ).toBe(
      '@misc{arena_a_report_without_a_safe_url_undated_0b5fv39,\n' +
        '  author = {{Arena}},\n' +
        '  title = {A report without a safe URL},\n' +
        '  note = {Arena Agent report.},\n' +
        '}\n',
    );
  });

  it('rejects credential-bearing URLs', () => {
    const bibtex = formatAgentReportBibtex({
      title: 'Private URL',
      url: 'https://user:secret@arena.example/share/agent/public-token',
    });

    expect(bibtex).not.toContain('secret');
    expect(bibtex).toContain('@misc{arena_private_url_undated_1cutwlh,');
  });

  it('keeps same-title reports distinct when they share a date', () => {
    const first = formatAgentReportBibtex({
      title: 'Daily brief',
      sharedAt: '2026-08-14T09:00:00Z',
      url: 'https://arena.example/share/agent/first-public-token',
    });
    const second = formatAgentReportBibtex({
      title: 'Daily brief',
      sharedAt: '2026-08-14T17:00:00Z',
      url: 'https://arena.example/share/agent/second-public-token',
    });

    const firstKey = first.match(/^@online\{([^,]+)/)?.[1];
    const secondKey = second.match(/^@online\{([^,]+)/)?.[1];
    expect(firstKey).toMatch(/^arena_daily_brief_20260814_/);
    expect(secondKey).toMatch(/^arena_daily_brief_20260814_/);
    expect(firstKey).not.toBe(secondKey);
  });
});
