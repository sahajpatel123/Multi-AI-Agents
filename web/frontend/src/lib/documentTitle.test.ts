import { describe, expect, it } from 'vitest';
import {
  titleForAgentBusy,
  titleForArenaBusy,
  titleForPath,
  titleForRoom,
  titleForShare,
} from './documentTitle';

describe('titleForPath', () => {
  it('labels marketing and product surfaces', () => {
    expect(titleForPath('/')).toContain('Four minds');
    expect(titleForPath('/pricing')).toBe('Pricing · Arena');
    expect(titleForPath('/product')).toBe('Product · Arena');
    expect(titleForPath('/capabilities')).toBe('Capabilities · Arena');
    expect(titleForPath('/about')).toBe('About · Arena');
  });

  it('labels authenticated primary flows', () => {
    expect(titleForPath('/app')).toBe('Arena panel · Arena');
    expect(titleForPath('/agent')).toBe('Agent Mode · Arena');
    expect(titleForPath('/agent/watchlist')).toBe('Watchlist · Arena');
    expect(titleForPath('/personas')).toBe('Personas · Arena');
  });

  it('handles rooms, share, trailing slashes, and unknown routes', () => {
    expect(titleForPath('/room/abc')).toBe('Room · Arena');
    expect(titleForPath('/share')).toBe('Shared take · Arena');
    expect(titleForPath('/pricing/')).toBe('Pricing · Arena');
    expect(titleForPath('/this-does-not-exist')).toBe('Not found · Arena');
  });
});

describe('busy document titles', () => {
  it('reflects Agent pipeline stages', () => {
    expect(titleForAgentBusy({ stage: 'researcher' })).toBe('Researching… · Agent Mode · Arena');
    expect(titleForAgentBusy({ stage: 'judge' })).toBe('Judging… · Agent Mode · Arena');
    expect(titleForAgentBusy({ refining: true })).toBe('Refining… · Agent Mode · Arena');
    expect(titleForAgentBusy({ challenging: true })).toBe('Challenging… · Agent Mode · Arena');
  });

  it('labels Arena in-flight modes', () => {
    expect(titleForArenaBusy('pipeline')).toContain('Starting');
    expect(titleForArenaBusy('streaming')).toContain('Four minds responding');
    expect(titleForArenaBusy('chat')).toContain('Mind replying');
    expect(titleForArenaBusy('debate')).toContain('Debate in progress');
    expect(titleForArenaBusy('discuss')).toContain('Discussing');
  });
});

describe('contextual document titles', () => {
  it('embeds room names and falls back when empty', () => {
    expect(titleForRoom('Climate board')).toBe('Climate board · Room · Arena');
    expect(titleForRoom('')).toBe('Room · Arena');
    expect(titleForRoom(null)).toBe('Room · Arena');
    const long = titleForRoom('A'.repeat(80));
    expect(long.length).toBeLessThan(80);
    expect(long).toMatch(/… · Room · Arena$/);
  });

  it('prefers agent name then prompt snippet for shared takes', () => {
    expect(titleForShare({ agentName: 'The Contrarian' })).toBe(
      'The Contrarian · Shared take · Arena',
    );
    expect(titleForShare({ prompt: 'Should we raise prices?' })).toBe(
      'Should we raise prices? · Shared take · Arena',
    );
    expect(titleForShare({})).toBe('Shared take · Arena');
  });
});
