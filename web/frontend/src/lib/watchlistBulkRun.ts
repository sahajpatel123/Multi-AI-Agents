/** Orchestrates bounded immediate re-check bursts for the Agent Watchlist. */

import { ApiError, type AgentWatchlistItem } from '../api';

export type WatchlistRunSkipReason =
  | 'in_progress'
  | 'no_question'
  | 'rate_limited'
  | 'auth';

export type WatchlistBulkRunResult = {
  /** Watch ids whose re-check actually started. */
  started: string[];
  /** Watch ids skipped because the backend said so or the burst was stopped. */
  skipped: Array<{ id: string; reason: WatchlistRunSkipReason }>;
  /** Watch ids that failed with a non-actionable error. */
  failed: Array<{ id: string; message: string }>;
};

export type WatchlistRunOne = (item: AgentWatchlistItem) => Promise<unknown>;

const DEFAULT_CONCURRENCY = 3;

/**
 * Start an immediate re-check for every active watch.
 *
 * This is the all-active convenience wrapper. Selected runs use the same
 * limiter-aware worker below so both actions report identical outcomes.
 */
export function runActiveWatchlistItems(
  items: readonly AgentWatchlistItem[],
  runOne: WatchlistRunOne,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<WatchlistBulkRunResult> {
  return runWatchlistItems(
    items.filter((item) => item.is_active),
    runOne,
    concurrency,
  );
}

/**
 * Start an immediate re-check for exactly the selected watches.
 *
 * Paused watches are valid here: a manual run advances their latest result
 * without changing their paused schedule. Keeping selection separate from
 * the active-only wrapper lets the UI offer targeted runs without silently
 * dropping a paused item the user deliberately chose.
 */
export function runSelectedWatchlistItems(
  items: readonly AgentWatchlistItem[],
  selectedIds: ReadonlySet<string>,
  runOne: WatchlistRunOne,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<WatchlistBulkRunResult> {
  return runWatchlistItems(
    items.filter((item) => selectedIds.has(item.id)),
    runOne,
    concurrency,
  );
}

/**
 * Run a bounded burst of candidate watches.
 *
 * The backend bounds manual runs at 12/hour/user (shared scope), so a burst
 * past the cap must stop instead of hammering the API: once a 429 arrives,
 * queued watches are skipped as `rate_limited` and no further requests fire.
 * A 401/403 session or access failure is just as global, so the burst stops
 * and the remaining watches are skipped as `auth`. Per-item errors that are
 * just "this watch cannot run right now" become skips, while unexpected
 * failures are reported verbatim.
 */
async function runWatchlistItems(
  items: readonly AgentWatchlistItem[],
  runOne: WatchlistRunOne,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<WatchlistBulkRunResult> {
  const candidates = items;
  const started: string[] = [];
  const skipped: Array<{ id: string; reason: WatchlistRunSkipReason }> = [];
  const failed: Array<{ id: string; message: string }> = [];
  const attempted = new Set<string>();
  let stopReason: WatchlistRunSkipReason | null = null;
  let cursor = 0;
  const nextIndex = () => cursor++;

  const worker = async () => {
    while (true) {
      if (stopReason) return;
      const index = nextIndex();
      if (index >= candidates.length) return;
      const item = candidates[index];
      attempted.add(item.id);
      try {
        await runOne(item);
        started.push(item.id);
      } catch (err) {
        const reason = runSkipReason(err);
        if (reason === 'rate_limited' || reason === 'auth') {
          // Every remaining watch would hit the same limiter or auth gate;
          // stop the burst instead of firing requests that cannot succeed.
          if (!stopReason) stopReason = reason;
          skipped.push({ id: item.id, reason });
          return;
        }
        if (reason) {
          skipped.push({ id: item.id, reason });
        } else {
          failed.push({ id: item.id, message: errorMessage(err) });
        }
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, candidates.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Watches that were still queued when the burst was cut off never got a
  // request; report them honestly with the reason that stopped the burst.
  for (const item of candidates) {
    if (!attempted.has(item.id)) {
      skipped.push({ id: item.id, reason: stopReason ?? 'rate_limited' });
    }
  }

  return { started, skipped, failed };
}

function runSkipReason(err: unknown): WatchlistRunSkipReason | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 401 || err.status === 403) return 'auth';
  if (err.status === 409) {
    // 409 covers both "already re-checking" and a Condura local-execution
    // rejection. Only the former is a harmless skip; the latter is an honest
    // failure the user should see, not a status the run was "already busy".
    return apiErrorCode(err) === 'watchlist_run_in_progress'
      ? 'in_progress'
      : null;
  }
  if (err.status === 400) return 'no_question';
  if (err.status === 429) return 'rate_limited';
  return null;
}

function apiErrorCode(err: ApiError): string | null {
  const detail = err.detail as
    | { detail?: unknown; error?: unknown }
    | null
    | undefined;
  const inner =
    detail && typeof detail === 'object' && 'detail' in detail
      ? detail.detail
      : detail;
  const error =
    inner && typeof inner === 'object'
      ? (inner as { error?: unknown }).error
      : null;
  return typeof error === 'string' ? error : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return 'Could not start this re-check';
}

/**
 * Human summary for the run-all notice, e.g.
 * "Started 2 re-checks. Skipped 1 (already re-checking)."
 */
export function formatWatchlistBulkRunNotice(
  result: WatchlistBulkRunResult,
): string {
  const parts: string[] = [];

  const startedCount = result.started.length;
  if (startedCount > 0) {
    parts.push(`Started ${startedCount} re-check${startedCount === 1 ? '' : 's'}.`);
  }

  const skippedInProgress = result.skipped.filter(
    (skip) => skip.reason === 'in_progress',
  ).length;
  const skippedNoQuestion = result.skipped.filter(
    (skip) => skip.reason === 'no_question',
  ).length;
  const skippedRateLimited = result.skipped.filter(
    (skip) => skip.reason === 'rate_limited',
  ).length;
  const skippedAuth = result.skipped.filter(
    (skip) => skip.reason === 'auth',
  ).length;

  if (skippedInProgress > 0) {
    parts.push(
      `Skipped ${skippedInProgress} (already re-checking).`,
    );
  }
  if (skippedNoQuestion > 0) {
    parts.push(`Skipped ${skippedNoQuestion} (no usable question).`);
  }
  if (skippedRateLimited > 0) {
    parts.push(
      `Skipped ${skippedRateLimited} (rate or daily limit reached).`,
    );
  }
  if (skippedAuth > 0) {
    parts.push(
      `Stopped ${skippedAuth} (session or access error).`,
    );
  }

  for (const failure of result.failed) {
    parts.push(`1 failed: ${failure.message}`);
  }

  if (parts.length === 0) return 'No active watches to run.';
  return parts.join(' ');
}
