import { describe, expect, it } from 'vitest';
import { formatArenaShareHtml } from './shareHtml';

describe('formatArenaShareHtml', () => {
  it('renders a single take with safe Markdown and provenance', () => {
    const html = formatArenaShareHtml({
      agentName: '<Analyst>',
      prompt: 'Should we ship?',
      response: 'Ship the **smallest** slice.\n\n`npm test`',
      shareUrl: 'https://arena.example/share?agent=analyst',
    });

    expect(html).toContain('<title>&lt;Analyst&gt; · Arena take</title>');
    expect(html).toContain('<strong>smallest</strong>');
    expect(html).toContain('<code>npm test</code>');
    expect(html).toContain('href="https://arena.example/share?agent=analyst"');
    expect(html).not.toContain('<script>');
  });

  it('renders every round take and marks the selected winner', () => {
    const html = formatArenaShareHtml({
      round: {
        prompt: 'Should we ship?',
        winnerAgentId: 'philosopher',
        takes: [
          { agentId: 'analyst', oneLiner: 'Ship now.', score: 84 },
          { agentId: 'philosopher', oneLiner: 'Wait one day.', score: 87 },
        ],
      },
      resolveAgentName: (id) => (id === 'analyst' ? 'The Analyst' : 'The Philosopher'),
    });

    expect(html).toContain('The Analyst');
    expect(html).toContain('The Philosopher');
    expect(html).toContain('take--winner');
    expect(html).toContain('87/100');
    expect(html).toContain('Arena winner');
  });

  it('rejects unsafe provenance URLs while keeping user content inert', () => {
    const html = formatArenaShareHtml({
      agentName: 'Analyst',
      response: '<img src=x onerror=alert(1)>',
      shareUrl: 'javascript:alert(1)',
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
  });
});
