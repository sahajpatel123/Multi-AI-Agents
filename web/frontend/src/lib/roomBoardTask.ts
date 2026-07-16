/**
 * Pure helpers for collaborative Room board task cards.
 */

import { formatIsoWhen, formatRelativePast } from './relativeTime';
import { resolveRoomTaskAnswerBody } from './roomBoardExport';

export type RoomBoardTaskLike = {
  title?: string | null;
  question?: string | null;
  task_text?: string | null;
  final_answer?: unknown;
  created_at?: string | null;
};

/** Prefer question fields; fall back to display title. */
export function roomBoardTaskQuestionText(
  task: RoomBoardTaskLike | null | undefined,
): string {
  if (!task) return '';
  const q = (task.question || task.task_text || '').trim();
  if (q) return q;
  return (task.title || '').trim();
}

/** Full answer body suitable for clipboard (markdown/plain). */
export function roomBoardTaskAnswerText(
  task: RoomBoardTaskLike | null | undefined,
): string {
  if (!task) return '';
  return resolveRoomTaskAnswerBody(task.final_answer).trim();
}

export function formatRoomBoardRelative(
  iso: string | null | undefined,
  nowMs?: number,
): string {
  return formatRelativePast(iso, {
    fallback: '—',
    localeAfterDays: 0,
    now: nowMs,
  });
}

export function roomBoardTimeTitle(iso: string | null | undefined): string {
  return formatIsoWhen(iso, { fallback: '', precision: 'minute' });
}

/** Member presence: active if last_seen within 5 minutes of `nowMs`. */
export function roomMemberOnline(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = 5 * 60 * 1000,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < windowMs;
}
