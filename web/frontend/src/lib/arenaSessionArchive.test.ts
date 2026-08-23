import { describe, expect, it, vi } from 'vitest';
import type { SessionData } from '../types';
import { loadSessionTranscriptBundles } from './arenaSessionArchive';

function makeSession(sessionId: string, topics: string[] = []): SessionData {
  return {
    session_id: sessionId,
    user_id: 'user-1',
    turns: [],
    topics,
    created_at: '2026-08-01T00:00:00Z',
    last_active: '2026-08-01T00:00:00Z',
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('loadSessionTranscriptBundles', () => {
  it('preserves the caller’s selection order when fetches settle out of order', async () => {
    const fetcher = vi.fn(async (sessionId: string) => {
      await wait(sessionId === 'chat-2' ? 5 : 0);
      return makeSession(sessionId);
    });

    const bundles = await loadSessionTranscriptBundles(
      ['chat-1', 'chat-2', 'chat-3'],
      fetcher,
      [],
    );

    expect(bundles.map((bundle) => bundle.sessionId)).toEqual([
      'chat-1',
      'chat-2',
      'chat-3',
    ]);
  });

  it('keeps every loadable chat when individual fetches fail', async () => {
    const fetcher = vi.fn((sessionId: string) => {
      if (sessionId === 'missing') return Promise.resolve(null);
      if (sessionId === 'broken') return Promise.reject(new Error('boom'));
      return Promise.resolve(makeSession(sessionId));
    });

    const bundles = await loadSessionTranscriptBundles(
      ['chat-1', 'missing', 'chat-2', 'broken'],
      fetcher,
      [
        { session_id: 'chat-1', title: 'First chat' },
        { session_id: 'chat-2', title: 'Second chat' },
      ],
    );

    expect(bundles.map((bundle) => bundle.sessionId)).toEqual([
      'chat-1',
      'chat-2',
    ]);
    expect(bundles[0]?.title).toBe('First chat');
    expect(bundles[1]?.title).toBe('Second chat');
  });

  it('deduplicates selected ids and falls back to a session topic title', async () => {
    const fetcher = vi.fn((sessionId: string) =>
      Promise.resolve(makeSession(sessionId, ['Launch plan'])),
    );

    const bundles = await loadSessionTranscriptBundles(
      ['chat-1', 'chat-1', 'chat-2'],
      fetcher,
      [],
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bundles.map((bundle) => bundle.sessionId)).toEqual([
      'chat-1',
      'chat-2',
    ]);
    expect(bundles[0]?.title).toBe('Launch plan');
  });

  it('caps concurrent fetches at the requested batch size', async () => {
    let active = 0;
    let peak = 0;
    const fetcher = vi.fn(async (sessionId: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(2);
      active -= 1;
      return makeSession(sessionId);
    });

    await loadSessionTranscriptBundles(
      ['chat-1', 'chat-2', 'chat-3', 'chat-4', 'chat-5'],
      fetcher,
      [],
      2,
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('uses the returned session id for provenance and deduplicates aliased requests', async () => {
    const fetcher = vi.fn((sessionId: string) => {
      if (sessionId === 'chat-1' || sessionId === 'chat-1-alias') {
        return Promise.resolve(makeSession('chat-1', ['Canonical plan']));
      }
      return Promise.resolve(makeSession('chat-2'));
    });

    const bundles = await loadSessionTranscriptBundles(
      ['chat-1-alias', 'chat-2', 'chat-1'],
      fetcher,
      [{ session_id: 'chat-1', title: 'Canonical title' }],
    );

    expect(bundles.map((bundle) => bundle.sessionId)).toEqual([
      'chat-1',
      'chat-2',
    ]);
    expect(bundles[0]?.title).toBe('Canonical title');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
