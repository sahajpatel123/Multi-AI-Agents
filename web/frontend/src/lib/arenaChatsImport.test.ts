import { describe, expect, it } from 'vitest';
import { parseArenaTranscriptsArchive } from './arenaChatsImport';

function take(
  agentId: string,
  verdict = `${agentId} says yes.`,
  timestamp: string | null = '2026-08-12T10:00:00Z',
) {
  return {
    agent_id: agentId,
    confidence: 82,
    one_liner: 'Yes.',
    verdict,
    key_assumption: 'Scope stays small.',
    timestamp,
  };
}

function exchange(
  overrides: Partial<{
    turn_id: string;
    prompt: string;
    prompt_category: string;
    timestamp: string | null;
    winner_agent_id: string;
    takes: unknown[];
  }> = {},
) {
  return {
    turn_id: 'turn-1',
    prompt: 'Should we launch the experiment now?',
    prompt_category: 'question',
    timestamp: '2026-08-12T10:00:00Z',
    winner_agent_id: 'agent_1',
    takes: [take('agent_1'), take('agent_2')],
    ...overrides,
  };
}

describe('parseArenaTranscriptsArchive', () => {
  it('parses a selected-chat archive into restorable chats', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'selected_chat_transcripts',
      format_version: 1,
      chat_count: 1,
      chats: [
        {
          index: 1,
          session_id: 'source-1',
          title: 'Launch review',
          transcript: {
            exported_from: 'arena',
            export_type: 'session_transcript',
            format_version: 1,
            session_id: 'source-1',
            exchanges: [
              exchange({
                turn_id: 'exchange-1',
                winner_agent_id: 'agent_2',
                takes: [take('agent_1'), take('agent_2', 'No, wait.')],
              }),
              exchange({
                turn_id: 'exchange-2',
                prompt: 'What about the second launch?',
              }),
            ],
          },
        },
      ],
    };

    const chats = parseArenaTranscriptsArchive(JSON.stringify(archive));
    expect(chats).toHaveLength(1);
    expect(chats[0]?.title).toBe('Launch review');
    expect(chats[0]?.turns).toHaveLength(2);
    expect(chats[0]?.turns[0]?.turn_id).toBe('exchange-1');
    expect(chats[0]?.turns[0]?.winner_id).toBe('agent_2');
    expect(chats[0]?.turns[0]?.agent_responses.agent_2.verdict).toBe('No, wait.');
    expect(chats[0]?.turns[1]?.prompt).toBe('What about the second launch?');
  });

  it('parses a single-chat transcript archive', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'session_transcript',
      format_version: 1,
      session_id: 'source-1',
      exchanges: [exchange()],
    };

    const chats = parseArenaTranscriptsArchive(JSON.stringify(archive));
    expect(chats).toHaveLength(1);
    expect(chats[0]?.title).toBe('source-1');
    expect(chats[0]?.turns[0]?.winner_id).toBe('agent_1');
  });

  it('restores null timestamps as null instead of failing the archive', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'session_transcript',
      format_version: 1,
      session_id: 'source-no-times',
      exchanges: [
        exchange({
          timestamp: null,
          takes: [take('agent_1', undefined, null)],
        }),
      ],
    };

    const chats = parseArenaTranscriptsArchive(JSON.stringify(archive));
    expect(chats[0]?.turns[0]?.timestamp).toBeNull();
    expect(chats[0]?.turns[0]?.agent_responses.agent_1.timestamp).toBeNull();
  });

  it('prefers a take flagged is_winner when the winner id is missing', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'session_transcript',
      format_version: 1,
      session_id: 'source-flag',
      exchanges: [
        exchange({
          winner_agent_id: '',
          takes: [
            take('agent_1'),
            { ...take('agent_2', 'No, wait.'), is_winner: true },
          ],
        }),
      ],
    };

    const chats = parseArenaTranscriptsArchive(JSON.stringify(archive));
    expect(chats[0]?.turns[0]?.winner_id).toBe('agent_2');
  });

  it('falls back to the chat session id when no title is present', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'selected_chat_transcripts',
      format_version: 1,
      chats: [
        {
          session_id: 'source-9',
          transcript: { exchanges: [exchange()] },
        },
      ],
    };

    const chats = parseArenaTranscriptsArchive(JSON.stringify(archive));
    expect(chats[0]?.title).toBe('source-9');
  });

  it('rejects JSON that was not exported from Arena', () => {
    expect(() =>
      parseArenaTranscriptsArchive(
        JSON.stringify({ exported_from: 'elsewhere', chats: [] }),
      ),
    ).toThrow('not exported from Arena');
  });

  it('rejects unsupported archive versions', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'selected_chat_transcripts',
      format_version: 99,
      chats: [],
    };
    expect(() => parseArenaTranscriptsArchive(JSON.stringify(archive))).toThrow(
      'Unsupported archive version',
    );
  });

  it('rejects an exchange with no supported Arena takes', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'session_transcript',
      format_version: 1,
      exchanges: [
        exchange({ takes: [{ agent_id: 'agent_999', verdict: 'Nope.' }] }),
      ],
    };
    expect(() => parseArenaTranscriptsArchive(JSON.stringify(archive))).toThrow(
      'no supported Arena takes',
    );
  });

  it('rejects malformed exchanges instead of silently dropping content', () => {
    const archive = {
      exported_from: 'arena',
      export_type: 'session_transcript',
      format_version: 1,
      exchanges: [exchange({ prompt: '  ' })],
    };
    expect(() => parseArenaTranscriptsArchive(JSON.stringify(archive))).toThrow(
      'has no prompt',
    );
  });
});
