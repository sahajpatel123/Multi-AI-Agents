import { describe, expect, it } from 'vitest';
import {
  buildRoundShareUrl,
  formatRoundShareText,
  parseRoundShareUrl,
  ROUND_SHARE_MAX_PROMPT_LEN,
  ROUND_SHARE_MAX_TAKE_LEN,
  ROUND_SHARE_MAX_URL_LEN,
} from './roundShare';

const takes = [
  { agentId: 'analyst', oneLiner: 'Ship the smallest honest slice.', score: 84 },
  { agentId: 'philosopher', oneLiner: 'Enough is when desire ends.', score: 87 },
];

describe('buildRoundShareUrl', () => {
  it('builds a public /share round URL with compact takes', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'Should we ship today?',
      winnerAgentId: 'philosopher',
      takes,
    });
    expect(url.startsWith('https://arena.app/share?')).toBe(true);
    expect(url).not.toContain('/app');
    const qs = new URL(url).searchParams;
    expect(qs.get('round')).toBe('1');
    expect(qs.get('prompt')).toBe('Should we ship today?');
    expect(qs.get('winner')).toBe('philosopher');
    expect(qs.get('t0')).toBe('analyst|84|Ship the smallest honest slice.');
    expect(qs.get('t1')).toBe('philosopher|87|Enough is when desire ends.');
  });

  it('clips oversized round text to the shared URL budget', () => {
    const long = 'x'.repeat(ROUND_SHARE_MAX_TAKE_LEN + 100);
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'p'.repeat(ROUND_SHARE_MAX_PROMPT_LEN + 100),
      takes: [{ agentId: 'a', oneLiner: long, score: 95 }],
    });
    const qs = new URL(url).searchParams;
    expect(qs.get('prompt')?.length).toBe(ROUND_SHARE_MAX_PROMPT_LEN);
    expect(qs.get('t0')).toContain(`${'x'.repeat(ROUND_SHARE_MAX_TAKE_LEN)}`);
  });

  it('drops takes beyond the four-card round limit', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'p',
      takes: Array.from({ length: 6 }, (_, i) => ({
        agentId: `a${i}`,
        oneLiner: `take ${i}`,
      })),
    });
    const qs = new URL(url).searchParams;
    expect(qs.get('t4')).toBeNull();
    expect(qs.get('t3')).toBe('a3||take 3');
  });

  it('drops empty takes before applying the four-card limit', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'p',
      takes: [
        { agentId: '', oneLiner: '' },
        { agentId: 'a0', oneLiner: 'first' },
        { agentId: '   ', oneLiner: '   ' },
        { agentId: 'a1', oneLiner: 'second' },
        { agentId: 'a2', oneLiner: 'third' },
        { agentId: 'a3', oneLiner: 'fourth' },
        { agentId: 'a4', oneLiner: 'fifth' },
      ],
    });
    const qs = new URL(url).searchParams;
    expect(qs.get('t0')).toBe('a0||first');
    expect(qs.get('t1')).toBe('a1||second');
    expect(qs.get('t2')).toBe('a2||third');
    expect(qs.get('t3')).toBe('a3||fourth');
    expect(qs.get('t4')).toBeNull();
  });

  it('stays inside the URL budget when multi-byte text expands on encoding', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: '🙂'.repeat(300),
      takes: Array.from({ length: 4 }, (_, i) => ({
        agentId: `a${i}`,
        oneLiner: '🙂'.repeat(120),
        score: 90,
      })),
    });
    expect(url.length).toBeLessThanOrEqual(ROUND_SHARE_MAX_URL_LEN);
    const parsed = parseRoundShareUrl(new URL(url).searchParams);
    expect(parsed).not.toBeNull();
    expect(parsed?.takes.length).toBeGreaterThan(0);
  });

  it('retains the selected winner when compacting an oversized round', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'p'.repeat(250),
      winnerAgentId: 'a3',
      takes: Array.from({ length: 4 }, (_, i) => ({
        agentId: `a${i}`,
        oneLiner: '🙂'.repeat(120),
        score: 90,
      })),
    });
    const parsed = parseRoundShareUrl(new URL(url).searchParams);
    expect(url.length).toBeLessThanOrEqual(ROUND_SHARE_MAX_URL_LEN);
    expect(parsed?.winnerAgentId).toBe('a3');
    expect(parsed?.takes.some((take) => take.agentId === 'a3' && take.oneLiner)).toBe(true);
  });
});

describe('parseRoundShareUrl', () => {
  it('round-trips a round URL back into structured data', () => {
    const url = buildRoundShareUrl({
      origin: 'https://arena.app',
      prompt: 'Should we ship today?',
      winnerAgentId: 'philosopher',
      takes,
    });
    const parsed = parseRoundShareUrl(new URL(url).searchParams);
    expect(parsed).not.toBeNull();
    expect(parsed?.prompt).toBe('Should we ship today?');
    expect(parsed?.winnerAgentId).toBe('philosopher');
    expect(parsed?.takes).toEqual([
      { agentId: 'analyst', oneLiner: 'Ship the smallest honest slice.', score: 84 },
      { agentId: 'philosopher', oneLiner: 'Enough is when desire ends.', score: 87 },
    ]);
  });

  it('tolerates one-liners that contain pipe separators', () => {
    const qs = new URLSearchParams();
    qs.set('round', '1');
    qs.set('prompt', 'p');
    qs.set('t0', 'analyst|84|A | pipe stays in the take');
    const parsed = parseRoundShareUrl(qs);
    expect(parsed?.takes[0].oneLiner).toBe('A | pipe stays in the take');
  });

  it('returns null for non-round links and unusable round payloads', () => {
    expect(parseRoundShareUrl(new URLSearchParams('agent=a&prompt=p&response=r'))).toBeNull();
    expect(parseRoundShareUrl(new URLSearchParams('round=1'))).toBeNull();
    expect(parseRoundShareUrl(new URLSearchParams('round=1&t0=garbage'))).toBeNull();
    expect(parseRoundShareUrl(new URLSearchParams('round=1&prompt=only a question'))).toBeNull();
  });
});

describe('formatRoundShareText', () => {
  it('formats a paste-friendly round with names, scores, and the link', () => {
    const text = formatRoundShareText({
      prompt: 'Should we ship today?',
      takes,
      resolveAgentName: (id) => (id === 'analyst' ? 'The Analyst' : 'The Philosopher'),
      shareUrl: 'https://arena.app/share?round=1',
    });
    expect(text).toContain('Arena round');
    expect(text).toContain('Q: Should we ship today?');
    expect(text).toContain('The Analyst · 84/100');
    expect(text).toContain('Enough is when desire ends.');
    expect(text).toContain('https://arena.app/share?round=1');
  });

  it('falls back gracefully for empty takes', () => {
    const text = formatRoundShareText({
      prompt: '',
      takes: [],
      resolveAgentName: () => '',
    });
    expect(text).toBe('Arena round');
  });
});
