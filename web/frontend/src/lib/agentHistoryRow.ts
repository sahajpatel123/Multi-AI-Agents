/**
 * Pure helpers for Agent history sidebar rows.
 *
 * Keeps re-run / copy text extraction and timestamp + confidence
 * formatting out of the 10k-line AgentPage so they stay unit-tested.
 */

import { formatIsoWhen, formatRelativePast } from './relativeTime';

export type HistoryRowLike = {
  task_text?: string | null;
  title?: string | null;
  final_confidence?: number | null;
  created_at?: string | null;
};

/** Prompt text used when the user chooses "Re-run" from a history row. */
export function historyItemRerunText(item: HistoryRowLike | null | undefined): string {
  return (item?.task_text || '').trim();
}

/**
 * Clipboard payload for "Copy question".
 * Prefers the original task text; falls back to the display title.
 */
export function historyItemCopyText(item: HistoryRowLike | null | undefined): string {
  const q = (item?.task_text || '').trim();
  if (q) return q;
  return (item?.title || '').trim();
}

/** Live-friendly relative label for history / live-update timestamps. */
export function formatHistoryRowRelative(
  iso: string | null | undefined,
  nowMs?: number,
): string {
  return formatRelativePast(iso, {
    fallback: '—',
    localeAfterDays: 0,
    now: nowMs,
  });
}

/** Absolute timestamp for hover title (empty when invalid). */
export function historyRowTimeTitle(iso: string | null | undefined): string {
  return formatIsoWhen(iso, { fallback: '', precision: 'minute' });
}

/**
 * Compact confidence badge text, e.g. "72%".
 * Accepts 0–1 fractions or already-percent 0–100 values.
 * Returns null when confidence is missing or out of range.
 */
export function formatHistoryConfidenceBadge(
  confidence: number | null | undefined,
): string | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  if (pct < 0 || pct > 100) return null;
  return `${pct}%`;
}
