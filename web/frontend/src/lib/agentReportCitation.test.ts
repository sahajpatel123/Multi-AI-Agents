import { describe, expect, it } from 'vitest';
import { formatAgentReportCitation } from './agentReportCitation';

describe('formatAgentReportCitation', () => {
  it('includes provenance in a compact Markdown citation', () => {
    expect(
      formatAgentReportCitation({
        title: 'Research [brief]',
        question: 'What should we verify first?',
        url: 'https://arena.example/share/agent/public-token',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      '[Research \\[brief\\]](<https://arena.example/share/agent/public-token>) — Arena Agent report.\n' +
        'Question: What should we verify first?\n' +
        'Shared: 2026-08-14\n',
    );
  });

  it('falls back to plain text for an unavailable or unsafe URL', () => {
    expect(
      formatAgentReportCitation({
        question: 'A report without a title',
        url: 'javascript:alert(1)',
      }),
    ).toBe('**A report without a title** — Arena Agent report.\n');
  });

  it('keeps hostile Markdown and URL punctuation inside the citation', () => {
    expect(
      formatAgentReportCitation({
        title: 'A [useful] *report*',
        question: 'Can [this](https://evil.example) be *trusted*? `no`',
        url: 'https://arena.example/share/agent/public-token?q=(draft)',
        sharedAt: '2026-08-14T11:00:00Z',
      }),
    ).toBe(
      '[A \\[useful\\] \\*report\\*](<https://arena.example/share/agent/public-token?q=(draft)>) — Arena Agent report.\n' +
        'Question: Can \\[this\\](https://evil.example) be \\*trusted\\*? \\`no\\`\n' +
        'Shared: 2026-08-14\n',
    );
  });

  it('omits URLs that contain credentials', () => {
    expect(
      formatAgentReportCitation({
        title: 'Private URL',
        url: 'https://user:secret@arena.example/share/agent/public-token',
      }),
    ).toBe('**Private URL** — Arena Agent report.\n');
  });
});
