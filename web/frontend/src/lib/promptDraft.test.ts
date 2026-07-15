import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPromptDraft,
  loadPromptDraft,
  savePromptDraft,
} from './promptDraft';

const KEY = 'test_prompt_draft';

describe('promptDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns empty when nothing stored', () => {
    expect(loadPromptDraft(KEY)).toBe('');
  });

  it('round-trips text through save and load', () => {
    savePromptDraft(KEY, 'Should I ship the prototype tonight?');
    expect(loadPromptDraft(KEY)).toBe('Should I ship the prototype tonight?');
  });

  it('uses caller-supplied keys so callers do not collide', () => {
    savePromptDraft('arena_prompt_draft:v1', 'arena text');
    savePromptDraft('agent_followup_draft:v1', 'followup text');
    expect(loadPromptDraft('arena_prompt_draft:v1')).toBe('arena text');
    expect(loadPromptDraft('agent_followup_draft:v1')).toBe('followup text');
  });

  it('caps stored text at 2000 characters', () => {
    const huge = 'x'.repeat(5000);
    savePromptDraft(KEY, huge);
    expect(loadPromptDraft(KEY)).toHaveLength(2000);
  });

  it('removes the entry when saving empty text', () => {
    savePromptDraft(KEY, 'something');
    savePromptDraft(KEY, '');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(loadPromptDraft(KEY)).toBe('');
  });

  it('removes the entry when saving whitespace-only text', () => {
    savePromptDraft(KEY, '   ');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clearPromptDraft removes the entry', () => {
    savePromptDraft(KEY, 'something');
    clearPromptDraft(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(loadPromptDraft(KEY)).toBe('');
  });
});