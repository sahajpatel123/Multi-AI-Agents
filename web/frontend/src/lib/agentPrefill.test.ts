import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_PREFILL_STORAGE_KEY,
  saveAgentPrefillQuestion,
  takeAgentPrefillQuestion,
} from './agentPrefill';
import { AGENT_TASK_MAX_CHARS } from './charBudget';

describe('agent prefill handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('trims and bounds a question before storing it', () => {
    saveAgentPrefillQuestion(`  ${'x'.repeat(AGENT_TASK_MAX_CHARS + 50)}  `);

    expect(sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY)).toBe(
      'x'.repeat(AGENT_TASK_MAX_CHARS),
    );
  });

  it('removes an earlier handoff when given an empty question', () => {
    saveAgentPrefillQuestion('A previous question');
    saveAgentPrefillQuestion('  ');

    expect(sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY)).toBeNull();
  });

  it('returns and clears a handoff exactly once', () => {
    saveAgentPrefillQuestion('  A shared question  ');

    expect(takeAgentPrefillQuestion()).toBe('A shared question');
    expect(takeAgentPrefillQuestion()).toBe('');
  });

  it('clears but does not apply a handoff when the URL has explicit task state', () => {
    saveAgentPrefillQuestion('A stale shared question');

    expect(takeAgentPrefillQuestion({ hasExplicitTask: true })).toBe('');
    expect(sessionStorage.getItem(AGENT_PREFILL_STORAGE_KEY)).toBeNull();
  });
});
