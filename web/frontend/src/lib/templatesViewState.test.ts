import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTemplatesViewState,
  DEFAULT_TEMPLATES_VIEW_STATE,
  loadTemplatesViewState,
  normalizeTemplatesViewState,
  saveTemplatesViewState,
  TEMPLATES_VIEW_STATE_KEY,
  templatesViewStateUseful,
} from './templatesViewState';
import { TEMPLATES_EXPERTISE_ALL } from './templatesExpertiseFilter';

describe('templatesViewState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts from defaults when nothing is stored', () => {
    expect(loadTemplatesViewState()).toEqual(DEFAULT_TEMPLATES_VIEW_STATE);
  });

  it('round-trips a non-default modal view', () => {
    saveTemplatesViewState({
      tab: 'Research',
      search: 'gamma review',
      sort: 'title',
      availability: 'ready',
      expertise: 'expert',
    });

    expect(loadTemplatesViewState()).toEqual({
      tab: 'Research',
      search: 'gamma review',
      sort: 'title',
      availability: 'ready',
      expertise: 'expert',
    });
    expect(templatesViewStateUseful(loadTemplatesViewState())).toBe(true);
  });

  it('recovers from malformed storage', () => {
    window.localStorage.setItem(TEMPLATES_VIEW_STATE_KEY, '{not json');
    expect(loadTemplatesViewState()).toEqual(DEFAULT_TEMPLATES_VIEW_STATE);

    window.localStorage.setItem(TEMPLATES_VIEW_STATE_KEY, JSON.stringify('nope'));
    expect(loadTemplatesViewState()).toEqual(DEFAULT_TEMPLATES_VIEW_STATE);
  });

  it('rejects invalid sort, availability, and non-string expertise', () => {
    const state = normalizeTemplatesViewState({
      tab: 'Business',
      search: 'brief',
      sort: 'bogus',
      availability: 'sometimes',
      expertise: 42,
    });

    expect(state).toEqual({
      tab: 'Business',
      search: 'brief',
      sort: 'default',
      availability: 'all',
      expertise: TEMPLATES_EXPERTISE_ALL,
    });
  });

  it('caps search and expertise length', () => {
    const state = normalizeTemplatesViewState({
      search: 'x'.repeat(200),
      expertise: 'e'.repeat(80),
    });

    expect(state.search).toHaveLength(120);
    expect(state.expertise).toHaveLength(40);
  });

  it('clears the stored view', () => {
    saveTemplatesViewState({
      tab: 'Technical',
      search: '',
      sort: 'default',
      availability: 'all',
      expertise: TEMPLATES_EXPERTISE_ALL,
    });
    expect(loadTemplatesViewState().tab).toBe('Technical');

    expect(clearTemplatesViewState()).toBeUndefined();
    expect(loadTemplatesViewState()).toEqual(DEFAULT_TEMPLATES_VIEW_STATE);
  });
});
