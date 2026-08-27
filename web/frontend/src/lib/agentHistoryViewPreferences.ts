/** Browser-local view preferences for Agent research history. */

import {
  AGENT_HISTORY_CONFIDENCE_OPTIONS,
  type AgentHistoryConfidenceFilter,
} from './agentHistoryConfidenceFilter';
import {
  AGENT_HISTORY_FEEDBACK_OPTIONS,
  type AgentHistoryFeedbackFilter,
} from './agentHistoryFeedbackFilter';
import {
  AGENT_HISTORY_PIN_FILTER_OPTIONS,
  type AgentHistoryPinFilter,
} from './agentHistoryPins';
import {
  AGENT_HISTORY_RECENCY_OPTIONS,
  type AgentHistoryRecencyFilter,
} from './agentHistoryRecencyFilter';
import {
  AGENT_HISTORY_SCORE_OPTIONS,
  type AgentHistoryScoreFilter,
} from './agentHistoryScoreFilter';
import {
  AGENT_HISTORY_SORT_OPTIONS,
  type AgentHistorySort,
} from './agentHistorySort';
import {
  AGENT_HISTORY_SOURCE_ALL,
  type AgentHistorySourceFilter,
} from './agentHistorySourceFilter';
import {
  AGENT_HISTORY_STATUS_OPTIONS,
  type AgentHistoryStatusFilter,
} from './agentHistoryStatusFilter';
import { AGENT_HISTORY_TOPIC_ALL, type AgentHistoryTopicFilter } from './agentHistoryTopicFilter';
import { safeLocalStorage } from './safeStorage';

export const AGENT_HISTORY_VIEW_PREFERENCES_STORAGE_KEY =
  'arena_agent_history_view_preferences_v1';

const SOURCE_FILTERS: readonly AgentHistorySourceFilter[] = [
  AGENT_HISTORY_SOURCE_ALL,
  'standalone',
  'watchlist',
  'orchestration',
];

const MAX_TOPIC_LENGTH = 80;

export type AgentHistoryViewPreferences = {
  sort: AgentHistorySort;
  status: AgentHistoryStatusFilter;
  score: AgentHistoryScoreFilter;
  confidence: AgentHistoryConfidenceFilter;
  recency: AgentHistoryRecencyFilter;
  feedback: AgentHistoryFeedbackFilter;
  topic: AgentHistoryTopicFilter;
  source: AgentHistorySourceFilter;
  pin: AgentHistoryPinFilter;
};

export const DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES: AgentHistoryViewPreferences = {
  sort: 'newest',
  status: 'all',
  score: 'all',
  confidence: 'all',
  recency: 'all',
  feedback: 'all',
  topic: AGENT_HISTORY_TOPIC_ALL,
  source: AGENT_HISTORY_SOURCE_ALL,
  pin: 'all',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionValue<T extends string>(
  value: unknown,
  options: readonly { value: T }[],
  fallback: T,
): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback;
}

function normalizeTopic(value: unknown): AgentHistoryTopicFilter {
  if (typeof value !== 'string') return AGENT_HISTORY_TOPIC_ALL;
  const topic = value.trim().toLowerCase();
  if (!topic || topic.length > MAX_TOPIC_LENGTH) return AGENT_HISTORY_TOPIC_ALL;
  return topic;
}

/**
 * Validate untrusted storage field-by-field. Unknown future values fall back
 * independently so one stale preference never discards the rest of the view.
 */
export function normalizeAgentHistoryViewPreferences(
  raw: unknown,
): AgentHistoryViewPreferences {
  const value = isRecord(raw) ? raw : {};
  return {
    sort: optionValue(
      value.sort,
      AGENT_HISTORY_SORT_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.sort,
    ),
    status: optionValue(
      value.status,
      AGENT_HISTORY_STATUS_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.status,
    ),
    score: optionValue(
      value.score,
      AGENT_HISTORY_SCORE_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.score,
    ),
    confidence: optionValue(
      value.confidence,
      AGENT_HISTORY_CONFIDENCE_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.confidence,
    ),
    recency: optionValue(
      value.recency,
      AGENT_HISTORY_RECENCY_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.recency,
    ),
    feedback: optionValue(
      value.feedback,
      AGENT_HISTORY_FEEDBACK_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.feedback,
    ),
    topic: normalizeTopic(value.topic),
    source: SOURCE_FILTERS.includes(value.source as AgentHistorySourceFilter)
      ? (value.source as AgentHistorySourceFilter)
      : DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.source,
    pin: optionValue(
      value.pin,
      AGENT_HISTORY_PIN_FILTER_OPTIONS,
      DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES.pin,
    ),
  };
}

/** Load saved view preferences, returning safe defaults on missing/corrupt storage. */
export function loadAgentHistoryViewPreferences(): AgentHistoryViewPreferences {
  const raw = safeLocalStorage.getItem(AGENT_HISTORY_VIEW_PREFERENCES_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES };
  try {
    return normalizeAgentHistoryViewPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_AGENT_HISTORY_VIEW_PREFERENCES };
  }
}

/** Persist a normalized preference object and return the value that was stored. */
export function persistAgentHistoryViewPreferences(
  preferences: AgentHistoryViewPreferences,
): AgentHistoryViewPreferences {
  const next = normalizeAgentHistoryViewPreferences(preferences);
  safeLocalStorage.setItem(AGENT_HISTORY_VIEW_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  return next;
}
