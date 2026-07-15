import { describe, expect, it } from 'vitest';
import {
  agentWorkInFlight,
  arenaWorkInFlight,
  debateWorkInFlight,
  discussWorkInFlight,
  shouldWarnOnLeave,
} from './busyNavigationGuard';

describe('busyNavigationGuard', () => {
  it('shouldWarnOnLeave only when busy', () => {
    expect(shouldWarnOnLeave(false)).toBe(false);
    expect(shouldWarnOnLeave(true)).toBe(true);
  });

  it('arenaWorkInFlight covers pipeline and streams', () => {
    expect(arenaWorkInFlight({})).toBe(false);
    expect(arenaWorkInFlight({ isLoading: true })).toBe(true);
    expect(arenaWorkInFlight({ isStreaming: true })).toBe(true);
    expect(arenaWorkInFlight({ isFocusedChatStreaming: true })).toBe(true);
  });

  it('agentWorkInFlight covers run / refine / challenge', () => {
    expect(agentWorkInFlight({})).toBe(false);
    expect(agentWorkInFlight({ isRunning: true })).toBe(true);
    expect(agentWorkInFlight({ isRefining: true })).toBe(true);
    expect(agentWorkInFlight({ isChallengingAnswer: true })).toBe(true);
  });

  it('debate and discuss stream guards', () => {
    expect(debateWorkInFlight('idle')).toBe(false);
    expect(debateWorkInFlight('streaming')).toBe(true);
    expect(debateWorkInFlight('done')).toBe(false);
    expect(discussWorkInFlight(false)).toBe(false);
    expect(discussWorkInFlight(true)).toBe(true);
  });
});
