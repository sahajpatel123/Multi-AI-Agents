import { describe, expect, it } from 'vitest';
import {
  bulkSaveNotice,
  isTakeSaved,
  unsavedTakes,
} from './arenaSavedTakes';
import type { PromptResponse, SavedResponseItem, ScoredAgent } from '../types';

const response = {
  session_id: 'session-1',
  all_responses: [
    {
      response: { agent_id: 'agent-a', agent_number: 1 },
      score: 90,
      is_winner: true,
    },
    {
      response: { agent_id: 'agent-b', agent_number: 2 },
      score: 80,
      is_winner: false,
    },
    {
      response: { agent_id: 'agent-c', agent_number: 3 },
      score: 70,
      is_winner: false,
    },
  ] as unknown as ScoredAgent[],
} as unknown as Pick<PromptResponse, 'session_id' | 'all_responses'>;

const savedItems = [
  { session_id: 'session-1', agent_id: 'agent-b' },
  { session_id: 'session-1', agent_id: 'agent-x' },
] as unknown as Pick<SavedResponseItem, 'session_id' | 'agent_id'>[];

describe('arenaSavedTakes', () => {
  it('detects takes already bookmarked for this session + agent', () => {
    expect(isTakeSaved(response, response.all_responses[0], savedItems)).toBe(false);
    expect(isTakeSaved(response, response.all_responses[1], savedItems)).toBe(true);
  });

  it('ignores saves from other sessions', () => {
    const otherSession = [
      { session_id: 'session-2', agent_id: 'agent-a' },
    ] as unknown as Pick<SavedResponseItem, 'session_id' | 'agent_id'>[];
    expect(isTakeSaved(response, response.all_responses[0], otherSession)).toBe(false);
  });

  it('returns only takes that are not already saved', () => {
    const missing = unsavedTakes(response, savedItems);
    expect(missing.map((take) => take.response.agent_id)).toEqual(['agent-a', 'agent-c']);
  });

  it('returns the full panel when nothing is saved', () => {
    const missing = unsavedTakes(response, []);
    expect(missing).toHaveLength(3);
  });

  it('handles an empty panel without crashing or claiming saves', () => {
    const emptyResponse = {
      ...response,
      all_responses: [],
    } as unknown as Pick<PromptResponse, 'session_id' | 'all_responses'>;
    expect(unsavedTakes(emptyResponse, savedItems)).toEqual([]);
    expect(bulkSaveNotice(0, 0)).toBe('Nothing to save yet');
  });

  it('builds honest labels for zero, partial, and full saves', () => {
    expect(bulkSaveNotice(4, 0)).toBe('All 4 takes are already saved');
    expect(bulkSaveNotice(4, 2)).toBe('Saving 2 takes…');
    expect(bulkSaveNotice(4, 1)).toBe('Saving 1 take…');
    expect(bulkSaveNotice(0, 0)).toBe('Nothing to save yet');
  });
});
