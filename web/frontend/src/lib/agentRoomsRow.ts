/**
 * Pure helpers for Agent Mode sidebar room rows.
 */

import { formatIsoWhen, formatRelativePast } from './relativeTime';

export type AgentRoomRowLike = {
  memberCount?: number | null;
  member_count?: number | null;
  taskCount?: number | null;
  task_count?: number | null;
  activityAt?: string | null;
  activity_at?: string | null;
  synthesisUpdatedAt?: string | null;
  synthesis_updated_at?: string | null;
  lastSeenAt?: string | null;
  last_seen_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  slug?: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** Resolve the best activity timestamp for a room row. */
export function resolveRoomActivityAt(room: AgentRoomRowLike | null | undefined): string | null {
  if (!room) return null;
  const candidates = [
    room.activityAt,
    room.activity_at,
    room.synthesisUpdatedAt,
    room.synthesis_updated_at,
    room.lastSeenAt,
    room.last_seen_at,
    room.createdAt,
    room.created_at,
  ];
  for (const c of candidates) {
    const s = (c || '').trim();
    if (s) return s;
  }
  return null;
}

/**
 * Compact meta line under a room name.
 * Example: "3 members · 5 tasks · 2h ago · New synthesis"
 */
export function formatAgentRoomMetaLine(
  room: AgentRoomRowLike | null | undefined,
  options: {
    nowMs?: number;
    needsAttention?: boolean;
  } = {},
): string {
  const members = num(room?.memberCount) ?? num(room?.member_count);
  const tasks = num(room?.taskCount) ?? num(room?.task_count);
  const parts: string[] = [];

  if (members != null) {
    parts.push(`${members} member${members === 1 ? '' : 's'}`);
  }
  if (tasks != null) {
    parts.push(`${tasks} task${tasks === 1 ? '' : 's'}`);
  }

  const activityAt = resolveRoomActivityAt(room);
  if (activityAt) {
    const rel = formatRelativePast(activityAt, {
      fallback: '',
      localeAfterDays: 0,
      now: options.nowMs,
    });
    if (rel) parts.push(rel);
  }

  if (options.needsAttention) {
    parts.push('New synthesis');
  }

  return parts.join(' · ');
}

/** Absolute activity time for hover titles. */
export function roomActivityTitle(room: AgentRoomRowLike | null | undefined): string {
  const activityAt = resolveRoomActivityAt(room);
  if (!activityAt) return '';
  return formatIsoWhen(activityAt, { fallback: '', precision: 'minute' });
}

/**
 * Public invite path for a room slug (origin-relative).
 * Caller prefixes with window.location.origin for full URLs.
 */
export function roomInvitePath(slug: string | null | undefined): string {
  const s = (slug || '').trim();
  if (!s) return '';
  return `/room/${encodeURIComponent(s)}`;
}

export function roomInviteUrl(
  slug: string | null | undefined,
  origin: string | null | undefined,
): string {
  const path = roomInvitePath(slug);
  if (!path) return '';
  const base = (origin || '').replace(/\/$/, '');
  if (!base) return path;
  return `${base}${path}`;
}
