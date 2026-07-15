import { describe, expect, it } from 'vitest';
import { agentToastAriaLive, agentToastKind, agentToastRole } from './agentToast';

describe('agentToast', () => {
  it('classifies failure copy as error', () => {
    expect(agentToastKind('Could not rename task')).toBe('error');
    expect(agentToastKind('Multi-task run failed or timed out.')).toBe('error');
    expect(agentToastKind('Task not found.')).toBe('error');
    expect(agentToastRole('error')).toBe('alert');
    expect(agentToastAriaLive('error')).toBe('assertive');
  });

  it('classifies success copy as polite status', () => {
    expect(agentToastKind('Added to watchlist.')).toBe('success');
    expect(agentToastKind('Task added to Climate board')).toBe('success');
    expect(agentToastRole('success')).toBe('status');
    expect(agentToastAriaLive('success')).toBe('polite');
  });
});
