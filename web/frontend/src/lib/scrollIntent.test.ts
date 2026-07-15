import { describe, expect, it } from 'vitest';
import { scrollIntentForLocation } from './scrollIntent';

describe('scrollIntentForLocation', () => {
  it('resets to top when there is no hash', () => {
    expect(scrollIntentForLocation('/pricing', '')).toEqual({ type: 'top' });
    expect(scrollIntentForLocation('/agent', '')).toEqual({ type: 'top' });
  });

  it('targets a safe hash id', () => {
    expect(scrollIntentForLocation('/', '#how-it-works')).toEqual({
      type: 'hash',
      id: 'how-it-works',
    });
  });

  it('ignores empty or unsafe hashes', () => {
    expect(scrollIntentForLocation('/', '#')).toEqual({ type: 'top' });
    expect(scrollIntentForLocation('/', '#foo bar')).toEqual({ type: 'top' });
  });
});
