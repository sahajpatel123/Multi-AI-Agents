import { describe, expect, it } from 'vitest';
import {
  arenaFullTakeExpandable,
  formatArenaTakeClipboard,
  pickArenaTakeBody,
  pickArenaTakeTeaser,
} from './arenaTakeClipboard';

describe('pickArenaTakeBody', () => {
  it('prefers full verdict over one-liner', () => {
    expect(
      pickArenaTakeBody({
        oneLiner: 'Short.',
        verdict: 'The full multi-paragraph take with structure.',
      }),
    ).toBe('The full multi-paragraph take with structure.');
  });

  it('falls back to one-liner', () => {
    expect(pickArenaTakeBody({ oneLiner: 'Only this', verdict: '' })).toBe('Only this');
  });
});

describe('formatArenaTakeClipboard', () => {
  it('includes question and full take as markdown', () => {
    const md = formatArenaTakeClipboard({
      agentName: 'The Critic',
      prompt: 'Should we ship?',
      oneLiner: 'Yes, carefully.',
      verdict: 'Ship with a kill switch and staged rollout.',
    });
    expect(md).toContain('# The Critic · Arena');
    expect(md).toContain('**Question:** Should we ship?');
    expect(md).toContain('Ship with a kill switch and staged rollout.');
    expect(md).not.toContain('Yes, carefully.');
  });
});

describe('pickArenaTakeTeaser', () => {
  it('prefers one-liner and truncates long text', () => {
    expect(pickArenaTakeTeaser({ oneLiner: 'Short take', verdict: 'Long' })).toBe('Short take');
    const long = 'x'.repeat(400);
    expect(pickArenaTakeTeaser({ oneLiner: long, maxLen: 40 }).endsWith('…')).toBe(true);
    expect(pickArenaTakeTeaser({ oneLiner: long, maxLen: 40 }).length).toBeLessThanOrEqual(40);
  });
});

describe('arenaFullTakeExpandable', () => {
  it('is false when verdict matches short one-liner', () => {
    expect(arenaFullTakeExpandable({ oneLiner: 'Ship it.', verdict: 'Ship it.' })).toBe(false);
  });

  it('is true when full take adds substance', () => {
    expect(
      arenaFullTakeExpandable({
        oneLiner: 'Ship carefully.',
        verdict:
          'Ship carefully with a staged rollout, kill switch, and clear success metrics before full launch.',
      }),
    ).toBe(true);
  });
});
