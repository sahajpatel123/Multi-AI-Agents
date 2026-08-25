import { describe, expect, it } from 'vitest';
import { formatAgentReportHtml } from './agentReportHtml';

describe('formatAgentReportHtml', () => {
  it('renders a portable report with metadata, Markdown blocks, and sources', () => {
    const html = formatAgentReportHtml({
      title: 'A <safe> report',
      question: 'What changed?',
      answer: '# Findings\n\n**Useful** result.\n\n- One\n- Two\n\n```ts\nconst answer = true;\n```',
      sources: ['https://example.com/paper', 'Published source'],
      url: 'https://arena.example/share/agent/token?utm_source=test#answer',
      sharedAt: '2026-08-14T11:00:00Z',
      finalScore: 84.4,
      finalConfidence: 0.756,
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>A &lt;safe&gt; report</title>');
    expect(html).toContain('<h1>A &lt;safe&gt; report</h1>');
    expect(html).toContain('<h1>Findings</h1>');
    expect(html).toContain('<strong>Useful</strong> result.');
    expect(html).toContain('<ul><li>One</li><li>Two</li></ul>');
    expect(html).toContain('<pre><code>const answer = true;</code></pre>');
    expect(html).toContain('Score 84');
    expect(html).toContain('Confidence 76%');
    expect(html).toContain('Sources consulted');
    expect(html).toContain('href="https://example.com/paper"');
    expect(html).not.toContain('utm_source');
    expect(html).not.toContain('#answer');
  });

  it('escapes hostile report content and rejects unsafe links', () => {
    const html = formatAgentReportHtml({
      title: 'Report </title><script>alert(1)</script>',
      question: '<img src=x onerror=alert(1)>',
      answer: '<script>alert(1)</script> [bad](javascript:alert(1))',
      sources: ['javascript:alert(1)', `https://example.com/${'x'.repeat(240)}…`],
      url: 'javascript:alert(1)',
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('target="_blank"');
  });

  it('falls back to a stable title and honest empty-answer copy', () => {
    const html = formatAgentReportHtml({ question: 'A question' });

    expect(html).toContain('<title>A question</title>');
    expect(html).toContain('No answer was provided.');
  });

  it('keeps Markdown syntax literal inside inline code spans', () => {
    const html = formatAgentReportHtml({
      answer:
        '`**literal**` and `[source](https://example.com/paper)` plus [source](https://example.com/paper)',
    });

    expect(html).toContain(
      '<code>**literal**</code> and <code>[source](https://example.com/paper)</code> plus <a href="https://example.com/paper" target="_blank" rel="noreferrer noopener">source</a>',
    );
    expect(html).not.toContain('<code><strong>literal</strong></code>');
    expect(html).not.toContain('<code><a ');
  });
});
