import { describe, expect, it } from 'vitest';
import { formatAgentReportClipboard } from './agentReportClipboard';

describe('formatAgentReportClipboard', () => {
  it('keeps rich and plain representations aligned', () => {
    const payload = formatAgentReportClipboard({
      question: 'Which path is safest?',
      answer: '## Recommendation\n\nChoose the staged rollout.',
      taskId: 'task-copy-123',
      sources: ['https://example.com/canonical'],
      sourceIntegritySources: [{ title: 'Older fallback' }],
      finalScore: 91,
      finalConfidence: 0.82,
    });

    expect(payload.html).toContain('<h1>Which path is safest?</h1>');
    expect(payload.html).toContain('<h2>Recommendation</h2>');
    expect(payload.html).toContain('Score 91');
    expect(payload.html).toContain('href="https://example.com/canonical"');
    expect(payload.html).not.toContain('Older fallback');

    expect(payload.plainText).toContain('**Question:** Which path is safest?');
    expect(payload.plainText).toContain('Choose the staged rollout.');
    expect(payload.plainText).toContain('1. https://example.com/canonical');
    expect(payload.plainText).toContain('_Task `task-copy-123`_');
  });

  it('uses compatibility sources and keeps hostile content inert', () => {
    const payload = formatAgentReportClipboard({
      question: '<img src=x onerror=alert(1)>',
      answer: '<script>alert(1)</script>',
      sourceIntegritySources: [{ name: 'Integrity source' }],
    });

    expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).toContain('Integrity source');
    expect(payload.plainText).toContain('<img src=x onerror=alert(1)>');
  });
});
