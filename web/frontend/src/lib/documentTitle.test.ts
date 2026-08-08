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
    expect(titleForPath('/docs')).toBe('Documentation · Arena');
    expect(titleForPath('/about')).toBe('About · Arena');
  });

  it('labels authenticated primary flows', () => {
    expect(titleForPath('/app')).toBe('Arena panel · Arena');
    expect(titleForPath('/agent')).toBe('Agent Mode · Arena');
    expect(titleForPath('/agent/watchlist')).toBe('Watchlist · Arena');
    expect(titleForPath('/personas')).toBe('Personas · Arena');
  });

  it('labels the persona playground hub and its deep-link pages', () => {
    expect(titleForPath('/persona-playground')).toBe('Persona Playground · Arena');
    expect(titleForPath('/persona-playground/compare')).toBe('Compare tools · Arena');
    expect(titleForPath('/persona-playground/categories')).toBe('Categories · Arena');
    expect(titleForPath('/persona-playground/favorites')).toBe('Favorites · Arena');
    expect(titleForPath('/persona-playground/index')).toBe('All tools A–Z · Arena');
    expect(titleForPath('/persona-playground/whats-new')).toBe("What's new · Arena");
    expect(titleForPath('/persona-playground/formats')).toBe('By format · Arena');
    expect(titleForPath('/persona-playground/sitemap')).toBe('Sitemap · Arena');
  });

  it('labels the top-traffic persona tool pages by entry name', () => {
    // Pinned to RelatedTools-mounted pages from cycle 343 — these are the
    // surfaces the cross-link rail points at, so they get real traffic.
    expect(titleForPath('/persona-mosaic')).toBe('Persona Mosaic · Arena');
    expect(titleForPath('/persona-dilemma')).toBe('Persona Dilemma · Arena');
    expect(titleForPath('/persona-match')).toBe('Persona Match · Arena');
    expect(titleForPath('/persona-council')).toBe('Persona Council · Arena');
    expect(titleForPath('/persona-battle')).toBe('Persona Battle · Arena');
  });

  it('labels every persona tool page by its catalog entry name (cycle 380)', () => {
    // Single-word tools get the "Persona " prefix; compound tools
    // (Roast Battle, Mosaic Council, …) drop it. Title mirrors
    // PERSONA_PLAYGROUND_ENTRIES verbatim so a rename in the catalog
    // is the only place this needs to be updated.
    expect(titleForPath('/persona-wheel')).toBe('Persona Wheel · Arena');
    expect(titleForPath('/persona-trivia')).toBe('Persona Trivia · Arena');
    expect(titleForPath('/persona-speed')).toBe('Persona Speed · Arena');
    expect(titleForPath('/persona-challenge')).toBe('Persona Challenge · Arena');
    expect(titleForPath('/persona-library')).toBe('Persona Library · Arena');
    expect(titleForPath('/persona-confessional')).toBe('Persona Confessional · Arena');
    expect(titleForPath('/persona-duel')).toBe('Persona Duel · Arena');
    expect(titleForPath('/persona-echo')).toBe('Persona Echo · Arena');
    expect(titleForPath('/persona-roast')).toBe('Persona Roast · Arena');
    expect(titleForPath('/persona-forecast')).toBe('Persona Forecast · Arena');
    expect(titleForPath('/persona-roast-battle')).toBe('Roast Battle · Arena');
    expect(titleForPath('/persona-forecast-battle')).toBe('Forecast Battle · Arena');
    expect(titleForPath('/persona-mosaic-battle')).toBe('Mosaic Battle · Arena');
    expect(titleForPath('/persona-mosaic-roasting-battle')).toBe('Mosaic Roasting Battle · Arena');
    expect(titleForPath('/persona-mosaic-council')).toBe('Mosaic Council · Arena');
    expect(titleForPath('/persona-dilemma-council')).toBe('Dilemma Council · Arena');
    expect(titleForPath('/persona-roast-battle-council')).toBe('Roast Battle Council · Arena');
    expect(titleForPath('/persona-mosaic-dilemma-council')).toBe('Mosaic Dilemma Council · Arena');
    expect(titleForPath('/persona-mosaic-roast')).toBe('Mosaic Roast · Arena');
    expect(titleForPath('/persona-dilemma-forecast')).toBe('Dilemma Forecast · Arena');
    expect(titleForPath('/persona-mosaic-dilemma-forecast')).toBe('Mosaic Dilemma Forecast · Arena');
    expect(titleForPath('/persona-mosaic-forecast')).toBe('Mosaic Forecast · Arena');
  });

  it('still labels unknown playground paths as not found', () => {
    // Typos under the playground prefix must NOT be silently swallowed
    // by a prefix wildcard — NotFoundPage needs the honest label.
    expect(titleForPath('/persona-playground/unknown')).toBe('Not found · Arena');
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
