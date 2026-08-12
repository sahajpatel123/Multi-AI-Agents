import type { SessionData } from '../types';
import type { ArenaTranscriptBundle } from './arenaExport';

/**
 * Minimal summary data the archive loader needs to attach a user-facing
 * title to each fetched transcript. `SessionSummary` from the API satisfies
 * this shape, but the helper stays decoupled so it can be tested directly.
 */
export type TranscriptSessionSummary = {
  session_id: string;
  title?: string | null;
};

export type SessionFetcher = (sessionId: string) => Promise<SessionData | null>;

const DEFAULT_SESSION_FETCH_CONCURRENCY = 4;

/**
 * Fetch a set of full chat transcripts for a combined export, preserving
 * the caller's selection order and surviving individual failures.
 *
 * Sessions are fetched in bounded parallel batches instead of one long
 * serial chain: a large selection exports far faster, while the concurrency
 * cap keeps the sidebar from firing dozens of session requests at once.
 * Fetches that return null or reject are skipped, so the resulting archive
 * is still produced for every chat that could be loaded.
 */
export async function loadSessionTranscriptBundles(
  sessionIds: string[],
  fetcher: SessionFetcher,
  summaries: readonly TranscriptSessionSummary[],
  concurrency: number = DEFAULT_SESSION_FETCH_CONCURRENCY,
): Promise<ArenaTranscriptBundle[]> {
  const ids = Array.from(
    new Set(Array.isArray(sessionIds) ? sessionIds : []),
  );
  const limit = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 1;
  const bundles: ArenaTranscriptBundle[] = [];

  for (let start = 0; start < ids.length; start += limit) {
    const batch = ids.slice(start, start + limit);
    const results = await Promise.allSettled(
      batch.map(async (sessionId) => {
        const session = await fetcher(sessionId);
        if (!session) return null;
        const summary = summaries.find(
          (candidate) => candidate.session_id === sessionId,
        );
        return {
          sessionId: session.session_id,
          title: summary?.title || session.topics?.[0] || null,
          turns: session.turns || [],
        } satisfies ArenaTranscriptBundle;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        bundles.push(result.value);
      }
    }
  }

  return bundles;
}
