import { describe, expect, it } from 'vitest';
import { buildShareText, buildShareUrl, SHARE_MAX_TEXT_LEN } from './shareUrl';

describe('buildShareUrl', () => {
  it('builds a public /share URL with query params', () => {
    const url = buildShareUrl({
      origin: 'https://arena.app',
      agentId: 'marcus_aurelius',
      prompt: 'What is enough?',
      response: 'Enough is when desire ends.',
    });
    expect(url.startsWith('https://arena.app/share?')).toBe(true);
    const qs = new URL(url).searchParams;
    expect(qs.get('agent')).toBe('marcus_aurelius');
    expect(qs.get('prompt')).toBe('What is enough?');
    expect(qs.get('response')).toBe('Enough is when desire ends.');
  });

  it('does not use the private /app session path', () => {
    const url = buildShareUrl({
      origin: 'https://arena.app',
      agentId: 'a',
      prompt: 'p',
      response: 'r',
    });
    expect(url).not.toContain('/app');
    expect(url).toContain('/share?');
  });

  it('clips oversized response text to SharePage limits', () => {
    const long = 'x'.repeat(SHARE_MAX_TEXT_LEN + 500);
    const url = buildShareUrl({
      origin: 'https://arena.app',
      agentId: 'a',
      prompt: 'p',
      response: long,
    });
    expect(new URL(url).searchParams.get('response')?.length).toBe(SHARE_MAX_TEXT_LEN);
  });
});

describe('buildShareText', () => {
  const shareUrl = 'https://arena.app/share?agent=a&prompt=p&response=r';

  it('embeds the public share URL for X / WhatsApp / email', () => {
    for (const channel of ['x', 'whatsapp', 'email'] as const) {
      const text = buildShareText({
        agentName: 'Marcus',
        oneLiner: 'Enough.',
        shareUrl,
        channel,
      });
      expect(text).toContain(shareUrl);
      expect(text).not.toMatch(/\/app(\?|$)/);
    }
  });
});
