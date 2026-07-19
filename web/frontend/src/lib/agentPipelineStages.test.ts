import { describe, expect, it } from 'vitest';
import {
  formatElapsedSeconds,
  getStageKey,
  pipelineStatusText,
  STAGE_KEYS,
  STAGE_STATUS,
  STAGE_WORDS,
  stageProgressIndex,
} from './agentPipelineStages';

describe('agentPipelineStages', () => {
  it('exposes seven runtime stages', () => {
    expect(STAGE_KEYS).toHaveLength(7);
  });

  it('resolves known stage keys and rejects unknown', () => {
    expect(getStageKey('researcher')).toBe('researcher');
    expect(getStageKey('judge')).toBe('judge');
    expect(getStageKey('nope')).toBeNull();
    expect(getStageKey(undefined)).toBeNull();
  });

  it('maps stage progress index for pipeline dots', () => {
    expect(stageProgressIndex('planner')).toBe(0);
    expect(stageProgressIndex('judge')).toBe(6);
    expect(stageProgressIndex('unknown')).toBe(0);
  });

  it('formats elapsed time as m:ss', () => {
    expect(formatElapsedSeconds(0)).toBe('0:00');
    expect(formatElapsedSeconds(65)).toBe('1:05');
    expect(formatElapsedSeconds(-3)).toBe('0:00');
  });

  it('returns honest status copy for stages', () => {
    expect(pipelineStatusText('verifier')).toContain('Verifying');
    expect(pipelineStatusText(undefined)).toContain('Planning');
  });

  it('STAGE_WORDS and STAGE_STATUS cover every stage key', () => {
    // STAGE_KEYS is the canonical order; STAGE_WORDS and STAGE_STATUS
    // must each have an entry per stage. If a stage is added to STAGE_KEYS
    // without a corresponding word or status, the loader shows nothing.
    const keySet = new Set<string>(STAGE_KEYS);
    const wordKeys = Object.keys(STAGE_WORDS);
    const statusKeys = Object.keys(STAGE_STATUS);

    expect(new Set(wordKeys)).toEqual(keySet);
    expect(new Set(statusKeys)).toEqual(keySet);

    // Sanity check: the values are non-empty so we don't ship a stage
    // with a blank word or status (the loader would render an empty dot).
    for (const k of STAGE_KEYS) {
      expect(STAGE_WORDS[k]).toBeTruthy();
      expect(STAGE_STATUS[k]).toBeTruthy();
    }
  });
});
