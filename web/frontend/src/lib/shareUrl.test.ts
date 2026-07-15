import { describe, expect, it } from 'vitest';
import {
  buildNativeShareData,
  buildShareTakeClipboardText,
  buildShareText,
  buildShareUrl,
  canUseNativeShare,
  invokeNativeShare,
  SHARE_MAX_TEXT_LEN,
} from './shareUrl';

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

describe('buildShareTakeClipboardText', () => {
  it('formats take with question, response, and public URL', () => {
    const text = buildShareTakeClipboardText({
      agentName: 'Marcus',
      prompt: 'What is enough?',
      response: 'Enough is when desire ends.',
      shareUrl: 'https://arena.app/share?agent=a',
    });
    expect(text).toContain('Marcus · Arena');
    expect(text).toContain('Q: What is enough?');
    expect(text).toContain('Enough is when desire ends.');
    expect(text).toContain('https://arena.app/share?agent=a');
    expect(text).not.toContain('/app');
  });

  it('handles response-only takes', () => {
    const text = buildShareTakeClipboardText({
      agentName: 'The Analyst',
      response: 'Ship the smallest honest slice.',
    });
    expect(text).toContain('The Analyst · Arena');
    expect(text).toContain('Ship the smallest honest slice.');
    expect(text).not.toContain('Q:');
  });
});

describe('native share helpers', () => {
  const shareUrl = 'https://arena.app/share?agent=a&prompt=p&response=r';

  it('buildNativeShareData uses public share URL and agent voice', () => {
    const data = buildNativeShareData({
      agentName: 'Marcus',
      oneLiner: 'Enough.',
      shareUrl,
    });
    expect(data.url).toBe(shareUrl);
    expect(data.title).toBe('Marcus on Arena');
    expect(data.text).toContain('Enough.');
    expect(data.text).toContain('Marcus');
    expect(data.url).not.toContain('/app');
  });

  it('canUseNativeShare detects navigator.share', () => {
    expect(canUseNativeShare({ share: async () => {} })).toBe(true);
    expect(canUseNativeShare({})).toBe(false);
    expect(canUseNativeShare(null)).toBe(false);
  });

  it('invokeNativeShare maps success, cancel, and failure', async () => {
    const data = buildNativeShareData({
      agentName: 'Marcus',
      oneLiner: 'Enough.',
      shareUrl,
    });
    expect(await invokeNativeShare(data, async () => {})).toBe('shared');

    const abort = Object.assign(new Error('dismissed'), { name: 'AbortError' });
    expect(
      await invokeNativeShare(data, async () => {
        throw abort;
      }),
    ).toBe('cancelled');

    expect(
      await invokeNativeShare(data, async () => {
        throw new Error('nope');
      }),
    ).toBe('failed');

    expect(await invokeNativeShare({ ...data, url: '' }, async () => {})).toBe('failed');
  });
});
