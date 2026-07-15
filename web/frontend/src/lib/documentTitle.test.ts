import { describe, expect, it } from 'vitest';
import { titleForAgentBusy, titleForArenaBusy, titleForPath } from './documentTitle';

describe('titleForPath', () => {
  it('labels marketing and product surfaces', () => {
    expect(titleForPath('/')).toContain('Four minds');
    expect(titleForPath('/pricing')).toBe('Pricing · Arena');
    expect(titleForPath('/product')).toBe('Product · Arena');
    expect(titleForPath('/about')).toBe('About · Arena');
  });

  it('labels authenticated primary flows', () => {
    expect(titleForPath('/app')).toBe('Arena panel · Arena');
    expect(titleForPath('/agent')).toBe('Agent Mode · Arena');
    expect(titleForPath('/agent/watchlist')).toBe('Watchlist · Arena');
    expect(titleForPath('/personas')).toBe('Personas · Arena');
  });

  it('handles rooms, share, and trailing slashes', () => {
    expect(titleForPath('/room/abc')).toBe('Room · Arena');
    expect(titleForPath('/share')).toBe('Shared take · Arena');
    expect(titleForPath('/pricing/')).toBe('Pricing · Arena');
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
