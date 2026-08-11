import { describe, expect, it } from 'vitest';
import {
  formatArenaExport,
  formatArenaCsvExport,
  formatArenaJsonExport,
  formatArenaTranscriptExport,
  formatArenaTranscriptCsvExport,
  formatArenaTranscriptJsonExport,
  formatArenaWinnerExport,
  pickArenaWinner,
} from './arenaExport';
import type { PromptResponse, SessionTurn } from '../types';

const sample: PromptResponse = {
  session_id: 's1',
  prompt: 'Should we ship this week?',
  prompt_category: 'question',
  winner: {} as PromptResponse['winner'],
  winner_agent_id: 'agent_1',
  all_responses: [
    {
      is_winner: false,
      score: 72,
      response: {
        agent_id: 'agent_2',
        agent_number: 2,
        one_liner: 'Question the deadline first.',
        verdict: 'The week is arbitrary.',
        confidence: 0.7,
        key_assumption: 'time pressure is real',
        timestamp: '',
      },
    },
    {
      is_winner: true,
      score: 91,
      response: {
        agent_id: 'agent_1',
        agent_number: 1,
        one_liner: 'Ship the smallest honest slice.',
        verdict: 'Ship a thin vertical that de-risks the week without rewriting the roadmap.',
        confidence: 0.9,
        key_assumption: 'quality bar is fixed',
        timestamp: '',
      },
    },
  ],
  integrity: null,
  tools_used: [],
  timestamp: '',
};

describe('formatArenaExport', () => {
  it('puts the winner first and includes prompt + one-liners', () => {
    const md = formatArenaExport(sample, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(md).toContain('Should we ship this week?');
    expect(md.indexOf('The Analyst')).toBeLessThan(md.indexOf('The Philosopher'));
    expect(md).toContain('winner');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Question the deadline first.');
  });

  it('normalizes a missing prompt without crashing', () => {
    const md = formatArenaExport(
      { ...sample, prompt: '' },
      (id) => ({ name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher' }),
    );
    expect(md).toContain('(no prompt)');
  });
});

describe('pickArenaWinner', () => {
  it('prefers is_winner flag', () => {
    const w = pickArenaWinner(sample);
    expect(w?.response.agent_id).toBe('agent_1');
  });

  it('falls back to winner_agent_id when no flag', () => {
    const unflagged: PromptResponse = {
      ...sample,
      all_responses: sample.all_responses.map((r) => ({ ...r, is_winner: false })),
    };
    expect(pickArenaWinner(unflagged)?.response.agent_id).toBe('agent_1');
  });

  it('falls back to highest score when neither flag nor winner_agent_id', () => {
    const byScore: PromptResponse = {
      ...sample,
      winner_agent_id: '',
      all_responses: sample.all_responses.map((r) => ({ ...r, is_winner: false })),
    };
    expect(pickArenaWinner(byScore)?.response.agent_id).toBe('agent_1');
  });

  it('returns null for empty responses', () => {
    expect(pickArenaWinner({ ...sample, all_responses: [] })).toBeNull();
  });
});

describe('formatArenaWinnerExport', () => {
  it('exports only the winner with score, take, and assumption', () => {
    const md = formatArenaWinnerExport(sample, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(md).toContain('# The Analyst · Arena winner');
    expect(md).toContain('Should we ship this week?');
    expect(md).toContain('**Score:** 91');
    expect(md).toContain('Ship the smallest honest slice.');
    expect(md).toContain('Ship a thin vertical');
    expect(md).toContain('quality bar is fixed');
    expect(md).toContain('winner only');
    expect(md).not.toContain('Question the deadline first.');
    expect(md).not.toContain('The Philosopher');
  });

  it('handles missing winner gracefully', () => {
    const md = formatArenaWinnerExport(
      { ...sample, all_responses: [], winner_agent_id: '' },
      () => ({ name: 'X' }),
    );
    expect(md).toContain('No winning take available');
  });

  it('does not duplicate the full take when verdict matches one_liner', () => {
    const collapsed: PromptResponse = {
      ...sample,
      all_responses: [
        {
          is_winner: true,
          score: 80,
          response: {
            agent_id: 'agent_1',
            agent_number: 1,
            one_liner: 'Ship it.',
            verdict: 'Ship it.',
            confidence: 0.8,
            key_assumption: '',
            timestamp: '',
          },
        },
      ],
    };
    const md = formatArenaWinnerExport(collapsed, () => ({ name: 'The Analyst' }));
    expect(md).toContain('> Ship it.');
    expect(md).not.toContain('## Full take');
  });

  it('falls back to agent id when persona name is missing', () => {
    const md = formatArenaWinnerExport(sample, () => ({ name: '' }));
    expect(md).toContain('# agent_1 · Arena winner');
  });

  it('omits score line when score is missing', () => {
    const noScore: PromptResponse = {
      ...sample,
      all_responses: sample.all_responses.map((r) => ({ ...r, score: undefined as unknown as number })),
    };
    const md = formatArenaWinnerExport(noScore, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(md).not.toContain('**Score:**');
  });
});

describe('formatArenaJsonExport', () => {
  it('serializes the round with winner, scores, and takes', () => {
    const json = formatArenaJsonExport(
      sample,
      (id) => ({
        name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
      }),
      { exportedAt: '2026-08-07T00:00:00.000Z' },
    );
    const parsed = JSON.parse(json);
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.exported_at).toBe('2026-08-07T00:00:00.000Z');
    expect(parsed.session_id).toBe('s1');
    expect(parsed.prompt).toBe('Should we ship this week?');
    expect(parsed.prompt_category).toBe('question');
    expect(parsed.winner_agent_id).toBe('agent_1');
    expect(parsed.tools_used).toEqual([]);
    expect(parsed.timestamp).toBe('');
    expect(parsed.integrity).toBeNull();
    expect(parsed.takes).toHaveLength(2);
    expect(parsed.takes[0]).toMatchObject({
      agent_id: 'agent_1',
      agent_name: 'The Analyst',
      is_winner: true,
      score: 91,
      confidence: 0.9,
      one_liner: 'Ship the smallest honest slice.',
      key_assumption: 'quality bar is fixed',
      contradiction: null,
    });
    expect(json.endsWith('\n')).toBe(true);
  });

  it('normalizes a missing prompt without crashing', () => {
    const json = formatArenaJsonExport(
      { ...sample, prompt: '' },
      () => ({ name: 'The Analyst' }),
      { exportedAt: '2026-08-07T00:00:00.000Z' },
    );
    const parsed = JSON.parse(json);
    expect(parsed.prompt).toBe('(no prompt)');
    expect(parsed.takes).toHaveLength(2);
  });
});

describe('formatArenaCsvExport', () => {
  it('writes one row per take with winner first', () => {
    const csv = formatArenaCsvExport(sample, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    expect(csv).toContain('"agentName","prompt","oneLiner","verdict","score","confidence","winner","keyAssumption"');
    expect(csv.indexOf('"The Analyst"')).toBeLessThan(csv.indexOf('"The Philosopher"'));
    expect(csv).toContain('"yes"');
    expect(csv).toContain('"quality bar is fixed"');
    expect(csv.endsWith('\n')).toBe(true);
  });
});

describe('formatArenaTranscriptCsvExport', () => {
  const turns: SessionTurn[] = [
    {
      turn_id: 't1',
      prompt: 'Should we ship this week?',
      prompt_category: 'question',
      winner_id: 'agent_1',
      timestamp: '2026-08-07T10:00:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Question the deadline first.',
          verdict: 'The week is arbitrary.',
          confidence: 0.7,
          key_assumption: 'time pressure is real',
          timestamp: '2026-08-07T10:00:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Ship the smallest honest slice.',
          verdict: 'Ship a thin vertical that de-risks the week without rewriting the roadmap.',
          confidence: 0.9,
          key_assumption: 'quality bar is fixed',
          timestamp: '2026-08-07T10:00:00Z',
        },
      },
    },
    {
      turn_id: 't2',
      prompt: 'Who owns the launch checklist?',
      prompt_category: 'task',
      winner_id: 'agent_2',
      timestamp: '2026-08-07T10:05:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Name a single owner.',
          verdict: 'Assign one accountable owner and give them the checklist.',
          confidence: 0.85,
          key_assumption: 'ownership beats committee',
          timestamp: '2026-08-07T10:05:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Spread the checklist.',
          verdict: 'Distribute items by expertise.',
          confidence: 0.6,
          key_assumption: 'team is large enough',
          timestamp: '2026-08-07T10:05:00Z',
        },
      },
    },
  ];

  it('writes one row per take with winner first inside each exchange', () => {
    const csv = formatArenaTranscriptCsvExport(turns, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }));
    const rows = csv.trim().split('\n');
    expect(rows[0]).toBe(
      '"exchange","turnId","timestamp","prompt","promptCategory","winnerAgentId","agentId","agentName","isWinner","confidence","oneLiner","verdict","keyAssumption","agentTimestamp"',
    );
    expect(rows).toHaveLength(5);
    expect(rows[1]).toContain('"1","t1","2026-08-07T10:00:00Z","Should we ship this week?","question","agent_1","agent_1","The Analyst","yes","0.9"');
    expect(rows[2]).toContain('"agent_2","The Philosopher","no"');
    expect(rows[3]).toContain('"2","t2","2026-08-07T10:05:00Z","Who owns the launch checklist?","task","agent_2","agent_2","The Philosopher","yes"');
    expect(rows[4]).toContain('"agent_1","The Analyst","no"');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('quotes and escapes commas, quotes, and multiline cells', () => {
    const csv = formatArenaTranscriptCsvExport(
      [
        {
          turn_id: 't3',
          prompt: 'Ship "now", please\nSecond line',
          prompt_category: '',
          winner_id: 'agent_1',
          timestamp: '',
          agent_responses: {
            agent_1: {
              agent_id: 'agent_1',
              agent_number: 1,
              one_liner: 'A, tricky one.',
              verdict: 'Details\nacross lines.',
              confidence: 0.8,
              key_assumption: '',
              timestamp: '',
            },
          },
        },
      ],
      () => ({ name: 'The Analyst' }),
    );
    expect(csv).toContain('"Ship ""now"", please\nSecond line"');
    expect(csv).toContain('"A, tricky one."');
    expect(csv).toContain('"Details\nacross lines."');
  });

  it('returns only the header for an empty session', () => {
    const csv = formatArenaTranscriptCsvExport([], () => ({ name: 'The Analyst' }));
    expect(csv.trim().split('\n')).toHaveLength(1);
    expect(csv).toContain('"exchange"');
  });

  it('drops a stale winner id and skips exchanges without recorded takes', () => {
    const csv = formatArenaTranscriptCsvExport(
      [
        {
          turn_id: 't4',
          prompt: 'Where did everyone go?',
          winner_id: 'agent_missing',
          timestamp: '2026-08-07T10:15:00Z',
          agent_responses: {},
        },
        {
          turn_id: 't5',
          prompt: 'Who should decide?',
          winner_id: 'agent_missing',
          timestamp: '2026-08-07T10:20:00Z',
          agent_responses: {
            agent_1: {
              agent_id: 'agent_1',
              agent_number: 1,
              one_liner: 'One owner.',
              verdict: 'Pick someone.',
              confidence: 0.8,
              key_assumption: 'someone is available',
              timestamp: '2026-08-07T10:20:00Z',
            },
          },
        },
      ],
      () => ({ name: 'The Analyst' }),
    );
    const rows = csv.trim().split('\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"2","t5"');
    expect(rows[1]).toContain('"The Analyst","no"');
    expect(rows[1].includes('yes')).toBe(false);
  });

  it('falls back to agent ids when no persona name resolves', () => {
    const csv = formatArenaTranscriptCsvExport(turns, () => ({ name: '' }));
    const rows = csv.trim().split('\n');
    expect(rows[1]).toContain('"agent_1","agent_1"');
  });
});

describe('formatArenaTranscriptExport', () => {
  const turns: SessionTurn[] = [
    {
      turn_id: 't1',
      prompt: 'Should we ship this week?',
      prompt_category: 'question',
      winner_id: 'agent_1',
      timestamp: '2026-08-07T10:00:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Question the deadline first.',
          verdict: 'The week is arbitrary.',
          confidence: 0.7,
          key_assumption: 'time pressure is real',
          timestamp: '2026-08-07T10:00:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Ship the smallest honest slice.',
          verdict: 'Ship a thin vertical that de-risks the week without rewriting the roadmap.',
          confidence: 0.9,
          key_assumption: 'quality bar is fixed',
          timestamp: '2026-08-07T10:00:00Z',
        },
      },
    },
    {
      turn_id: 't2',
      prompt: 'Who owns the launch checklist?',
      prompt_category: 'task',
      winner_id: 'agent_2',
      timestamp: '2026-08-07T10:05:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Name a single owner.',
          verdict: 'Assign one accountable owner and give them the checklist.',
          confidence: 0.85,
          key_assumption: 'ownership beats committee',
          timestamp: '2026-08-07T10:05:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Spread the checklist.',
          verdict: 'Distribute items by expertise.',
          confidence: 0.6,
          key_assumption: 'team is large enough',
          timestamp: '2026-08-07T10:05:00Z',
        },
      },
    },
  ];

  it('renders every exchange with the winner first in each section', () => {
    const md = formatArenaTranscriptExport(turns, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }), { exportedAt: '2026-08-07T12:00:00.000Z' });

    expect(md).toContain('# Arena — session transcript');
    expect(md).toContain('**Exported:** 2026-08-07T12:00:00.000Z');
    expect(md).toContain('**Exchanges:** 2');
    expect(md).toContain('## Exchange 1 · question');
    expect(md).toContain('## Exchange 2 · task');
    expect(md).toContain('**Question:** Should we ship this week?');
    expect(md).toContain('**Question:** Who owns the launch checklist?');
    expect(md).toContain('**Time:** 2026-08-07T10:00:00Z');
    expect(md).toContain('**Time:** 2026-08-07T10:05:00Z');

    const firstExchange = md.slice(0, md.indexOf('## Exchange 2'));
    expect(firstExchange.indexOf('### The Analyst · winner · confidence 0.9'))
      .toBeLessThan(firstExchange.indexOf('### The Philosopher'));
    expect(firstExchange).toContain('quality bar is fixed');
    expect(firstExchange).toContain('time pressure is real');

    expect(md).toContain('### The Philosopher · winner · confidence 0.85');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('falls back to agent ids when no persona name resolves', () => {
    const md = formatArenaTranscriptExport(turns, () => ({ name: '' }), {
      exportedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(md).toContain('### agent_1 · winner');
    expect(md).toContain('### agent_2');
  });

  it('includes an optional session id for provenance', () => {
    const md = formatArenaTranscriptExport(turns, () => ({ name: 'The Analyst' }), {
      exportedAt: '2026-08-07T12:00:00.000Z',
      sessionId: 'session-abc123',
    });
    expect(md).toContain('**Session:** session-abc123');
    expect(md.indexOf('**Session:** session-abc123')).toBeLessThan(md.indexOf('**Exported:**'));
  });

  it('normalizes multiline prompts and falls back to take timestamps', () => {
    const md = formatArenaTranscriptExport(
      [
        {
          turn_id: 't3',
          prompt: 'First line\nSecond line',
          prompt_category: 'statement',
          winner_id: '',
          timestamp: '',
          agent_responses: {
            agent_1: {
              agent_id: 'agent_1',
              agent_number: 1,
              one_liner: 'A single line.',
              verdict: 'Details.',
              confidence: 0.8,
              key_assumption: 'assumption',
              timestamp: '2026-08-07T10:10:00Z',
            },
          },
        },
      ],
      () => ({ name: 'The Analyst' }),
      { exportedAt: '2026-08-07T12:00:00.000Z' },
    );
    expect(md).toContain('**Question:** First line Second line');
    expect(md).toContain('**Time:** 2026-08-07T10:10:00Z');
    expect(md).not.toContain('\nSecond line');
  });

  it('renders a placeholder when an exchange has no recorded takes', () => {
    const md = formatArenaTranscriptExport(
      [
        {
          turn_id: 't4',
          prompt: 'Where did everyone go?',
          winner_id: '',
          timestamp: '2026-08-07T10:15:00Z',
          agent_responses: {},
        },
      ],
      () => ({ name: 'The Analyst' }),
      { exportedAt: '2026-08-07T12:00:00.000Z' },
    );
    expect(md).toContain('_No agent takes recorded for this exchange._');
    expect(md).toContain('**Time:** 2026-08-07T10:15:00Z');
  });

  it('renders a friendly placeholder for an empty session', () => {
    const md = formatArenaTranscriptExport([], () => ({ name: 'The Analyst' }), {
      exportedAt: '2026-08-07T12:00:00.000Z',
    });
    expect(md).toContain('**Exchanges:** 0');
    expect(md).toContain('_No exchanges in this session yet._');
  });
});

describe('formatArenaTranscriptJsonExport', () => {
  const turns: SessionTurn[] = [
    {
      turn_id: 't1',
      prompt: 'Should we ship this week?',
      prompt_category: 'question',
      winner_id: 'agent_1',
      timestamp: '2026-08-07T10:00:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Question the deadline first.',
          verdict: 'The week is arbitrary.',
          confidence: 0.7,
          key_assumption: 'time pressure is real',
          timestamp: '2026-08-07T10:00:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Ship the smallest honest slice.',
          verdict: 'Ship a thin vertical that de-risks the week without rewriting the roadmap.',
          confidence: 0.9,
          key_assumption: 'quality bar is fixed',
          timestamp: '2026-08-07T10:00:00Z',
        },
      },
    },
    {
      turn_id: 't2',
      prompt: 'Who owns the launch checklist?',
      prompt_category: 'task',
      winner_id: 'agent_2',
      timestamp: '2026-08-07T10:05:00Z',
      agent_responses: {
        agent_2: {
          agent_id: 'agent_2',
          agent_number: 2,
          one_liner: 'Name a single owner.',
          verdict: 'Assign one accountable owner and give them the checklist.',
          confidence: 0.85,
          key_assumption: 'ownership beats committee',
          timestamp: '2026-08-07T10:05:00Z',
        },
        agent_1: {
          agent_id: 'agent_1',
          agent_number: 1,
          one_liner: 'Spread the checklist.',
          verdict: 'Distribute items by expertise.',
          confidence: 0.6,
          key_assumption: 'team is large enough',
          timestamp: '2026-08-07T10:05:00Z',
        },
      },
    },
  ];

  it('serializes every exchange with winner first and session provenance', () => {
    const json = formatArenaTranscriptJsonExport(turns, (id) => ({
      name: id === 'agent_1' ? 'The Analyst' : 'The Philosopher',
    }), { exportedAt: '2026-08-07T12:00:00.000Z', sessionId: 'session-abc123' });
    const parsed = JSON.parse(json);
    expect(parsed.exported_from).toBe('arena');
    expect(parsed.export_type).toBe('session_transcript');
    expect(parsed.exported_at).toBe('2026-08-07T12:00:00.000Z');
    expect(parsed.session_id).toBe('session-abc123');
    expect(parsed.exchange_count).toBe(2);
    expect(parsed.exchanges).toHaveLength(2);
    expect(parsed.exchanges[0]).toMatchObject({
      turn_id: 't1',
      prompt: 'Should we ship this week?',
      prompt_category: 'question',
      timestamp: '2026-08-07T10:00:00Z',
      winner_agent_id: 'agent_1',
    });
    expect(parsed.exchanges[0].takes[0]).toMatchObject({
      agent_id: 'agent_1',
      agent_name: 'The Analyst',
      is_winner: true,
      confidence: 0.9,
      one_liner: 'Ship the smallest honest slice.',
      key_assumption: 'quality bar is fixed',
    });
    expect(parsed.exchanges[0].takes[1].agent_id).toBe('agent_2');
    expect(parsed.exchanges[1].winner_agent_id).toBe('agent_2');
    expect(parsed.exchanges[1].takes[0].is_winner).toBe(true);
    expect(parsed.exchanges[1].takes[1].is_winner).toBe(false);
    expect(json.endsWith('\n')).toBe(true);
  });

  it('falls back to agent ids and preserves multiline fields verbatim', () => {
    const json = formatArenaTranscriptJsonExport(
      [
        {
          turn_id: 't3',
          prompt: 'First line\nSecond line',
          winner_id: '',
          timestamp: '',
          agent_responses: {
            agent_1: {
              agent_id: 'agent_1',
              agent_number: 1,
              one_liner: 'A single line.',
              verdict: 'Details\nacross lines.',
              confidence: 0.8,
              key_assumption: 'assumption',
              timestamp: '2026-08-07T10:10:00Z',
            },
          },
        },
      ],
      () => ({ name: '' }),
      { exportedAt: '2026-08-07T12:00:00.000Z' },
    );
    const parsed = JSON.parse(json);
    expect(parsed.exchanges[0].prompt).toBe('First line\nSecond line');
    expect(parsed.exchanges[0].timestamp).toBe('2026-08-07T10:10:00Z');
    expect(parsed.exchanges[0].takes[0]).toMatchObject({
      agent_name: 'agent_1',
      verdict: 'Details\nacross lines.',
    });
  });

  it('handles empty sessions and exchanges without takes', () => {
    const empty = JSON.parse(
      formatArenaTranscriptJsonExport([], () => ({ name: 'The Analyst' }), {
        exportedAt: '2026-08-07T12:00:00.000Z',
      }),
    );
    expect(empty.exchange_count).toBe(0);
    expect(empty.exchanges).toEqual([]);

    const sparse = JSON.parse(
      formatArenaTranscriptJsonExport(
        [
          {
            turn_id: 't4',
            prompt: 'Where did everyone go?',
            winner_id: '',
            timestamp: '2026-08-07T10:15:00Z',
            agent_responses: {},
          },
        ],
        () => ({ name: 'The Analyst' }),
        { exportedAt: '2026-08-07T12:00:00.000Z' },
      ),
    );
    expect(sparse.exchanges[0].takes).toEqual([]);
    expect(sparse.exchanges[0].winner_agent_id).toBeNull();
  });

  it('pins a format version so consumers can detect incompatible archives', () => {
    const parsed = JSON.parse(
      formatArenaTranscriptJsonExport(turns, () => ({ name: 'The Analyst' }), {
        exportedAt: '2026-08-07T12:00:00.000Z',
      }),
    );
    expect(parsed.format_version).toBe(1);
  });

  it('drops a stale winner id that matches no stored take', () => {
    const parsed = JSON.parse(
      formatArenaTranscriptJsonExport(
        [
          {
            turn_id: 't5',
            prompt: 'Who should decide?',
            winner_id: 'agent_missing',
            timestamp: '2026-08-07T10:20:00Z',
            agent_responses: {
              agent_1: {
                agent_id: 'agent_1',
                agent_number: 1,
                one_liner: 'One owner.',
                verdict: 'Pick someone.',
                confidence: 0.8,
                key_assumption: 'someone is available',
                timestamp: '2026-08-07T10:20:00Z',
              },
            },
          },
        ],
        () => ({ name: 'The Analyst' }),
        { exportedAt: '2026-08-07T12:00:00.000Z' },
      ),
    );
    expect(parsed.exchanges[0].winner_agent_id).toBeNull();
    expect(parsed.exchanges[0].takes[0].is_winner).toBe(false);
  });

  it('normalizes blank fields and rejects invalid confidence values', () => {
    const parsed = JSON.parse(
      formatArenaTranscriptJsonExport(
        [
          {
            turn_id: 't6',
            prompt: '   ',
            prompt_category: '  ',
            winner_id: '',
            timestamp: '',
            agent_responses: {
              agent_1: {
                agent_id: 'agent_1',
                agent_number: 1,
                one_liner: '  ',
                verdict: '',
                confidence: Number.NaN,
                key_assumption: '',
                timestamp: '',
              },
            },
          },
        ],
        () => ({ name: 'The Analyst' }),
        { exportedAt: '2026-08-07T12:00:00.000Z' },
      ),
    );
    expect(parsed.exchanges[0]).toMatchObject({
      prompt: '(no prompt)',
      prompt_category: null,
      winner_agent_id: null,
      timestamp: null,
    });
    expect(parsed.exchanges[0].takes[0]).toMatchObject({
      one_liner: null,
      verdict: null,
      key_assumption: null,
      confidence: null,
      timestamp: null,
    });
  });

  it('falls back to the agent id when the persona resolver returns nothing', () => {
    const parsed = JSON.parse(
      formatArenaTranscriptJsonExport(
        [
          {
            turn_id: 't7',
            prompt: 'Hello?',
            winner_id: 'agent_1',
            timestamp: '2026-08-07T10:25:00Z',
            agent_responses: {
              agent_1: {
                agent_id: 'agent_1',
                agent_number: 1,
                one_liner: 'Hi.',
                verdict: 'Hello.',
                confidence: 0.5,
                key_assumption: '',
                timestamp: '2026-08-07T10:25:00Z',
              },
            },
          },
        ],
        () => undefined as unknown as { name: string },
        { exportedAt: '2026-08-07T12:00:00.000Z' },
      ),
    );
    expect(parsed.exchanges[0].takes[0].agent_name).toBe('agent_1');
  });

  it('handles a null turns payload without crashing', () => {
    const parsed = JSON.parse(
      formatArenaTranscriptJsonExport(null as unknown as SessionTurn[], () => ({
        name: 'The Analyst',
      }), { exportedAt: '2026-08-07T12:00:00.000Z' }),
    );
    expect(parsed.exchange_count).toBe(0);
    expect(parsed.exchanges).toEqual([]);
  });
});
