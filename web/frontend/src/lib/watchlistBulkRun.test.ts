import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AgentWatchlistItem } from '../api';
import {
  formatWatchlistBulkRunNotice,
  runActiveWatchlistItems,
} from './watchlistBulkRun';

function watch(
  id: string,
  overrides: Partial<AgentWatchlistItem> = {},
): AgentWatchlistItem {
  return {
    id,
    question: `Question ${id}`,
    interval_hours: 24,
    expertise_level: 'curious',
    expertise_domain: '',
    last_run_at: null,
    next_run_at: '2026-08-15T10:00:00Z',
    latest_task_id: null,
    run_count: 0,
    is_active: true,
    created_at: '2026-08-10T00:00:00Z',
    latest_task: null,
    ...overrides,
  };
}

describe('runActiveWatchlistItems', () => {
  it('starts every active watch and ignores paused ones', async () => {
    const runner = vi.fn().mockResolvedValue({ task_id: 'task' });
    const result = await runActiveWatchlistItems(
      [
        watch('a'),
        watch('paused', { is_active: false }),
        watch('b'),
      ],
      runner,
    );

    expect(result).toEqual({
      started: ['a', 'b'],
      skipped: [],
      failed: [],
    });
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('skips watches already re-checking (409)', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Already re-checking', 409))
      .mockResolvedValue({ task_id: 'task' });
    const result = await runActiveWatchlistItems([watch('a'), watch('b')], runner, 1);

    expect(result.started).toEqual(['b']);
    expect(result.skipped).toEqual([{ id: 'a', reason: 'in_progress' }]);
    expect(result.failed).toEqual([]);
  });

  it('skips watches without a usable question (400)', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('No usable question', 400))
      .mockResolvedValue({ task_id: 'task' });
    const result = await runActiveWatchlistItems([watch('a'), watch('b')], runner, 1);

    expect(result.started).toEqual(['b']);
    expect(result.skipped).toEqual([{ id: 'a', reason: 'no_question' }]);
  });

  it('stops the burst on 429 and reports queued watches as rate-limited', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Too many runs', 429))
      .mockResolvedValue({ task_id: 'task' });
    const result = await runActiveWatchlistItems(
      [watch('a'), watch('b'), watch('c')],
      runner,
      1,
    );

    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.started).toEqual([]);
    expect(result.skipped).toEqual([
      { id: 'a', reason: 'rate_limited' },
      { id: 'b', reason: 'rate_limited' },
      { id: 'c', reason: 'rate_limited' },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('reports unexpected failures with their message', async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('Server exploded'))
      .mockResolvedValue({ task_id: 'task' });
    const result = await runActiveWatchlistItems([watch('a'), watch('b')], runner, 1);

    expect(result.started).toEqual(['b']);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([{ id: 'a', message: 'Server exploded' }]);
  });

  it('returns an empty result when there is nothing active', async () => {
    const runner = vi.fn();
    const result = await runActiveWatchlistItems([watch('a', { is_active: false })], runner);
    expect(result).toEqual({ started: [], skipped: [], failed: [] });
    expect(runner).not.toHaveBeenCalled();
  });

  it('runs multiple watches concurrently without exceeding the cap', async () => {
    let inFlight = 0;
    let peak = 0;
    const runner = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { task_id: 'task' };
    });
    const result = await runActiveWatchlistItems(
      [watch('a'), watch('b'), watch('c'), watch('d'), watch('e')],
      runner,
      3,
    );

    expect(result.started).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe('formatWatchlistBulkRunNotice', () => {
  it('summarizes a fully successful run', () => {
    expect(
      formatWatchlistBulkRunNotice({
        started: ['a', 'b'],
        skipped: [],
        failed: [],
      }),
    ).toBe('Started 2 re-checks.');
  });

  it('keeps singular grammar for one re-check', () => {
    expect(
      formatWatchlistBulkRunNotice({
        started: ['a'],
        skipped: [],
        failed: [],
      }),
    ).toBe('Started 1 re-check.');
  });

  it('reports each skip reason', () => {
    expect(
      formatWatchlistBulkRunNotice({
        started: ['a'],
        skipped: [
          { id: 'b', reason: 'in_progress' },
          { id: 'c', reason: 'no_question' },
          { id: 'd', reason: 'rate_limited' },
        ],
        failed: [],
      }),
    ).toBe(
      'Started 1 re-check. Skipped 1 (already re-checking). Skipped 1 (no usable question). Skipped 1 (rate or daily limit reached).',
    );
  });

  it('surfaces unexpected failures', () => {
    expect(
      formatWatchlistBulkRunNotice({
        started: [],
        skipped: [],
        failed: [{ id: 'a', message: 'Server exploded' }],
      }),
    ).toBe('1 failed: Server exploded');
  });

  it('explains when nothing could run', () => {
    expect(
      formatWatchlistBulkRunNotice({
        started: [],
        skipped: [],
        failed: [],
      }),
    ).toBe('No active watches to run.');
  });
});
