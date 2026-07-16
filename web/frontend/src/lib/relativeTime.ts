/**
 * Shared relative-time helpers.
 *
 * Five near-identical helpers lived across ProfileModal, Sidebar,
 * WatchlistPage, and AgentPage with subtle differences (fallback
 * string, locale vs. raw day count). This module is the single
 * source of truth so future tweaks happen once and the UI stays
 * consistent.
 */

export type RelativePastOptions = {
  /** What to return when iso is null/invalid. Default ''. */
  fallback?: string;
  /**
   * If true, format older dates via toLocaleDateString() instead of
   * "Nd ago". Useful for surfaces that want a stable anchor (e.g.
   * profile cards) rather than a rolling "20d ago" that creeps.
   * Default false.
   */
  localeAfterDays?: number;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Past relative time. "Just now" / "Xm ago" / "Xh ago" / "Xd ago",
 * with locale fallback at 7+ days when localeAfterDays is set.
 *
 * Examples:
 *   formatRelativePast('2026-07-16T12:00:00Z', { now: NOW }) === '2h ago'
 *   formatRelativePast('2020-01-01T00:00:00Z', { now: NOW, localeAfterDays: 7 })
 *     === '1/1/2020' (locale-formatted)
 */
export function formatRelativePast(
  iso: string | null | undefined,
  options: RelativePastOptions & { now?: number } = {},
): string {
  const fallback = options.fallback ?? '';
  const ms = parseMs(iso);
  if (ms == null) return fallback;
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  const localeAfter = options.localeAfterDays ?? 7;
  if (localeAfter > 0 && day >= localeAfter && iso) {
    return new Date(iso).toLocaleDateString();
  }
  return `${day}d ago`;
}

/**
 * Future relative time. "in Xm" / "in Xh" / "in Xd", or "due now"
 * when the timestamp is already in the past.
 *
 * Examples:
 *   formatRelativeFuture('2026-07-16T13:00:00Z', { now: NOW }) === 'in 1h'
 *   formatRelativeFuture('2026-07-16T11:00:00Z', { now: NOW }) === 'due now'
 */
export function formatRelativeFuture(
  iso: string | null | undefined,
  options: { fallback?: string; now?: number } = {},
): string {
  const fallback = options.fallback ?? '';
  const ms = parseMs(iso);
  if (ms == null) return fallback;
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const sec = Math.round((ms - now) / 1000);
  if (sec < 0) return 'due now';
  if (sec < 60) return 'in <1m';
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `in ${hr}h`;
  const day = Math.floor(hr / 24);
  return `in ${day}d`;
}

/**
 * Absolute UTC date string for markdown export contexts.
 * Pass `precision: 'minute'` for `YYYY-MM-DD HH:MM UTC` (default)
 * or `'day'` for `YYYY-MM-DD`. Returns fallback on null / invalid input.
 *
 * Centralizes two near-identical helpers that lived in
 * agentRoomsExport.ts (minute precision, '—' fallback) and
 * temporalEvolutionExport.ts (day precision, '' fallback).
 */
export function formatIsoWhen(
  iso: string | null | undefined,
  options: {
    fallback?: string;
    precision?: 'minute' | 'day';
  } = {},
): string {
  const fallback = options.fallback ?? '';
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const precision = options.precision ?? 'minute';
  if (precision === 'day') {
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
