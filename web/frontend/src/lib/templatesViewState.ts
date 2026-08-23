/**
 * Persisted view state for the Agent task Templates modal.
 *
 * Keeps the last tab, search query, sort order, and availability/expertise
 * filters across modal opens so users can return to the exact slice of the
 * catalog they were working with. Same versioned-key, safe-parse,
 * silent-failure conventions as the favorites/recent template stores.
 */

import {
  TEMPLATES_AVAILABILITY_OPTIONS,
  type TemplatesAvailability,
} from './templatesAvailabilityFilter';
import {
  TEMPLATES_EXPERTISE_ALL,
  type TemplatesExpertiseFilter,
} from './templatesExpertiseFilter';
import {
  TEMPLATES_SORT_OPTIONS,
  type TemplatesSort,
} from './templatesSort';

const STORAGE_KEY = 'arena_agent_templates_view_v1';
const MAX_SEARCH_LENGTH = 120;
const MAX_EXPERTISE_LENGTH = 40;

export type TemplatesViewState = {
  /** Active tab id; the modal validates this against its own tab list. */
  tab: string;
  search: string;
  sort: TemplatesSort;
  availability: TemplatesAvailability;
  expertise: TemplatesExpertiseFilter;
};

export const DEFAULT_TEMPLATES_VIEW_STATE: TemplatesViewState = {
  tab: 'All',
  search: '',
  sort: 'default',
  availability: 'all',
  expertise: TEMPLATES_EXPERTISE_ALL,
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeExpertise(value: unknown): TemplatesExpertiseFilter {
  if (typeof value !== 'string') return TEMPLATES_EXPERTISE_ALL;
  const clean = value.trim().slice(0, MAX_EXPERTISE_LENGTH);
  return clean || TEMPLATES_EXPERTISE_ALL;
}

/** Sanitize untrusted storage into a bounded, typed view state. */
export function normalizeTemplatesViewState(raw: unknown): TemplatesViewState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TEMPLATES_VIEW_STATE };
  }
  const o = raw as {
    tab?: unknown;
    search?: unknown;
    sort?: unknown;
    availability?: unknown;
    expertise?: unknown;
  };
  const tab = typeof o.tab === 'string' && o.tab.trim() ? o.tab.trim() : 'All';
  const search =
    typeof o.search === 'string' ? o.search.slice(0, MAX_SEARCH_LENGTH) : '';
  const sort = TEMPLATES_SORT_OPTIONS.some((opt) => opt.value === o.sort)
    ? (o.sort as TemplatesSort)
    : 'default';
  const availability = TEMPLATES_AVAILABILITY_OPTIONS.some(
    (opt) => opt.value === o.availability,
  )
    ? (o.availability as TemplatesAvailability)
    : 'all';
  return {
    tab,
    search,
    sort,
    availability,
    expertise: normalizeExpertise(o.expertise),
  };
}

/** Load the last modal view, falling back to defaults on any failure. */
export function loadTemplatesViewState(): TemplatesViewState {
  if (!isBrowser()) return { ...DEFAULT_TEMPLATES_VIEW_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TEMPLATES_VIEW_STATE };
    return normalizeTemplatesViewState(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_TEMPLATES_VIEW_STATE };
  }
}

/** Persist the current modal view, sanitizing it before storage. */
export function saveTemplatesViewState(state: TemplatesViewState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeTemplatesViewState(state)),
    );
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Remove the stored modal view. */
export function clearTemplatesViewState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the state differs from the modal defaults. */
export function templatesViewStateUseful(state: TemplatesViewState): boolean {
  return (
    state.tab !== DEFAULT_TEMPLATES_VIEW_STATE.tab ||
    state.search !== DEFAULT_TEMPLATES_VIEW_STATE.search ||
    state.sort !== DEFAULT_TEMPLATES_VIEW_STATE.sort ||
    state.availability !== DEFAULT_TEMPLATES_VIEW_STATE.availability ||
    state.expertise !== DEFAULT_TEMPLATES_VIEW_STATE.expertise
  );
}

export const TEMPLATES_VIEW_STATE_KEY = STORAGE_KEY;
