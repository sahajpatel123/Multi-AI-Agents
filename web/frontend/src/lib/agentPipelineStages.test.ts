import { describe, expect, it } from 'vitest';
import {
  formatElapsedSeconds,
  getStageKey,
  pipelineStatusText,
  STAGE_KEYS,
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
});
