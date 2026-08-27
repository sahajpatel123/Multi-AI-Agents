/** Shareable URL state for Agent research history. */

import {
  DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES,
  normalizeAgentHistoryViewPreferences,
  type AgentHistoryViewPreferences,
} from './agentHistoryViewPreferences';

export const AGENT_HISTORY_VIEW_QUERY_KEYS = {
  marker: 'history_view',
  search: 'history_q',
  sort: 'history_sort',
  status: 'history_status',
  score: 'history_score',
  confidence: 'history_confidence',
  recency: 'history_recency',
  feedback: 'history_feedback',
  topic: 'history_topic',
  source: 'history_source',
  // Kept here so builders can explicitly strip a legacy/local-only pin
  // parameter. Pins are device-local and must never travel in a shared link.
  pin: 'history_pin',
} as const;

export const AGENT_HISTORY_VIEW_QUERY_MARKER = '1';
export const AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH = 160;

type ShareablePreferenceKey = Exclude<keyof AgentHistoryViewPreferences, 'pin'>;

const SHAREABLE_PREFERENCE_KEYS: readonly ShareablePreferenceKey[] = [
  'sort',
  'status',
  'score',
  'confidence',
  'recency',
  'feedback',
  'topic',
  'source',
];

const QUERY_KEY_BY_PREFERENCE: Record<ShareablePreferenceKey, string> = {
  sort: AGENT_HISTORY_VIEW_QUERY_KEYS.sort,
  status: AGENT_HISTORY_VIEW_QUERY_KEYS.status,
  score: AGENT_HISTORY_VIEW_QUERY_KEYS.score,
  confidence: AGENT_HISTORY_VIEW_QUERY_KEYS.confidence,
  recency: AGENT_HISTORY_VIEW_QUERY_KEYS.recency,
  feedback: AGENT_HISTORY_VIEW_QUERY_KEYS.feedback,
  topic: AGENT_HISTORY_VIEW_QUERY_KEYS.topic,
  source: AGENT_HISTORY_VIEW_QUERY_KEYS.source,
};

export type AgentHistoryViewFromUrl = {
  preferences: AgentHistoryViewPreferences;
  searchQuery: string;
};

function boundedSearchQuery(value: string | null | undefined): string {
  // NULs are not useful search input and can create surprising behavior when
  // this value is copied between URL and storage boundaries. Count Unicode
  // code points so a cap never leaves a dangling UTF-16 surrogate behind.
  // eslint-disable-next-line no-control-regex
  const clean = (value ?? '').replace(/\u0000/g, '').trim();
  return Array.from(clean).slice(0, AGENT_HISTORY_SHARED_SEARCH_MAX_LENGTH).join('');
}

/**
 * Read a shared history view from URL params, using the caller's saved view
 * as the base for fields omitted by older links. Invalid URL values are
 * normalized by the same field-by-field rules as local preferences.
 */
export function readAgentHistoryViewFromSearchParams(
  params: URLSearchParams,
  basePreferences: AgentHistoryViewPreferences = DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES,
): AgentHistoryViewFromUrl | null {
  const raw: Record<string, unknown> = {};
  let hasViewState = params.get(AGENT_HISTORY_VIEW_QUERY_KEYS.marker) === AGENT_HISTORY_VIEW_QUERY_MARKER;

  for (const preference of SHAREABLE_PREFERENCE_KEYS) {
    const value = params.get(QUERY_KEY_BY_PREFERENCE[preference]);
    if (value !== null) {
      raw[preference] = value;
      hasViewState = true;
    }
  }

  const rawSearch = params.get(AGENT_HISTORY_VIEW_QUERY_KEYS.search);
  if (rawSearch !== null) hasViewState = true;
  if (!hasViewState) return null;

  // Pins are intentionally device-local. A shared link must never inherit a
  // recipient's stale "Pinned only" preference or imply that pins travel.
  raw.pin = DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.pin;

  return {
    preferences: normalizeAgentHistoryViewPreferences({
      ...basePreferences,
      ...raw,
    }),
    searchQuery: boundedSearchQuery(rawSearch),
  };
}

/**
 * Build a shareable history URL without leaking task/prompt deep-link state.
 * The returned URL keeps unrelated query params intact for the surrounding
 * route, while replacing any previous history-view params.
 */
export function buildAgentHistoryViewUrl(
  currentUrl: string | URL,
  preferences: AgentHistoryViewPreferences,
  searchQuery = '',
): string {
  const url = new URL(String(currentUrl), 'https://arena.invalid');
  const normalized = normalizeAgentHistoryViewPreferences(preferences);

  url.searchParams.delete('task_id');
  url.searchParams.delete('q');
  url.searchParams.delete('createRoom');
  url.searchParams.delete(AGENT_HISTORY_VIEW_QUERY_KEYS.marker);
  url.searchParams.delete(AGENT_HISTORY_VIEW_QUERY_KEYS.search);
  url.searchParams.delete(AGENT_HISTORY_VIEW_QUERY_KEYS.pin);
  for (const preference of SHAREABLE_PREFERENCE_KEYS) {
    url.searchParams.delete(QUERY_KEY_BY_PREFERENCE[preference]);
  }

  url.searchParams.set(AGENT_HISTORY_VIEW_QUERY_KEYS.marker, AGENT_HISTORY_VIEW_QUERY_MARKER);
  for (const preference of SHAREABLE_PREFERENCE_KEYS) {
    url.searchParams.set(QUERY_KEY_BY_PREFERENCE[preference], String(normalized[preference]));
  }

  const boundedQuery = boundedSearchQuery(searchQuery);
  if (boundedQuery) {
    url.searchParams.set(AGENT_HISTORY_VIEW_QUERY_KEYS.search, boundedQuery);
  }

  return url.toString();
}
