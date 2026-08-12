import type { AgentResponse, SessionTurn } from '../types';
import { AGENTS } from '../types';

export type ImportedChat = {
  /** User-facing title for the restored chat (null falls back to the last prompt). */
  title: string | null;
  /** Restored transcript exchanges in original order. */
  turns: SessionTurn[];
};

type RawTake = {
  agent_id?: unknown;
  confidence?: unknown;
  one_liner?: unknown;
  verdict?: unknown;
  key_assumption?: unknown;
  timestamp?: unknown;
};

type RawExchange = {
  turn_id?: unknown;
  prompt?: unknown;
  prompt_category?: unknown;
  timestamp?: unknown;
  winner_agent_id?: unknown;
  winner_id?: unknown;
  takes?: RawTake[];
};

type RawTranscript = {
  session_id?: unknown;
  exchanges?: RawExchange[];
};

type RawArchive = {
  exported_from?: unknown;
  export_type?: unknown;
  format_version?: unknown;
  session_id?: unknown;
  exchanges?: RawExchange[];
  chats?: Array<{ title?: unknown; session_id?: unknown; transcript?: RawTranscript }>;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function agentNumberForId(agentId: string): number | null {
  const config = AGENTS[agentId];
  if (config) return config.agent_number;
  const match = /^agent_([1-4])$/.exec(agentId);
  return match ? Number(match[1]) : null;
}

function parseExchanges(exchanges: unknown): SessionTurn[] {
  if (!Array.isArray(exchanges)) {
    throw new Error('Archive is missing the exchanges array.');
  }
  return exchanges.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Exchange ${index + 1} is not a valid object.`);
    }
    const exchange = raw as RawExchange;
    const prompt = cleanString(exchange.prompt);
    if (!prompt) {
      throw new Error(`Exchange ${index + 1} has no prompt.`);
    }

    const agentResponses: Record<string, AgentResponse> = {};
    for (const rawTake of Array.isArray(exchange.takes) ? exchange.takes : []) {
      if (!rawTake || typeof rawTake !== 'object') continue;
      const agentId = cleanString(rawTake.agent_id);
      const agentNumber = agentNumberForId(agentId);
      if (agentNumber === null) continue;
      const rawConfidence = Number(rawTake.confidence);
      const confidence = Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(100, Math.round(rawConfidence)))
        : 0;
      agentResponses[agentId] = {
        agent_id: agentId,
        agent_number: agentNumber,
        verdict: cleanString(rawTake.verdict),
        one_liner: cleanString(rawTake.one_liner),
        confidence,
        key_assumption: cleanString(rawTake.key_assumption),
        timestamp: cleanString(rawTake.timestamp),
      };
    }

    const agentIds = Object.keys(agentResponses);
    if (agentIds.length === 0) {
      throw new Error(`Exchange ${index + 1} has no supported Arena takes.`);
    }
    const winnerCandidate =
      cleanString(exchange.winner_agent_id) || cleanString(exchange.winner_id);
    const winnerId =
      winnerCandidate && agentResponses[winnerCandidate]
        ? winnerCandidate
        : agentIds[0];

    return {
      turn_id: cleanString(exchange.turn_id),
      prompt,
      prompt_category: cleanString(exchange.prompt_category) || undefined,
      agent_responses: agentResponses,
      winner_id: winnerId,
      timestamp: cleanString(exchange.timestamp),
    };
  });
}

function parseSelectedArchive(raw: RawArchive): ImportedChat[] {
  const chats = Array.isArray(raw.chats) ? raw.chats : [];
  const imported: ImportedChat[] = [];
  for (const chat of chats) {
    if (!chat || typeof chat !== 'object' || !chat.transcript) continue;
    const turns = parseExchanges(chat.transcript.exchanges);
    if (turns.length === 0) continue;
    imported.push({
      title: cleanString(chat.title) || cleanString(chat.session_id) || null,
      turns,
    });
  }
  if (imported.length === 0) {
    throw new Error('The archive contains no restorable chats.');
  }
  return imported;
}

/**
 * Parse a JSON transcript archive exported by Arena (single-chat or
 * selected-chat archive) into the shape the restore API expects.
 *
 * The parser is strict on purpose: it only accepts Arena's own exported
 * envelope and version, rejects malformed exchanges, and drops unknown
 * agent slots instead of importing a transcript that cannot be resumed.
 */
export function parseArenaTranscriptsArchive(text: string): ImportedChat[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('This file is not an Arena transcript archive.');
  }
  const raw = data as RawArchive;
  if (raw.exported_from !== 'arena') {
    throw new Error('This file was not exported from Arena.');
  }
  if (raw.export_type === 'selected_chat_transcripts') {
    if (raw.format_version !== 1) {
      throw new Error(`Unsupported archive version ${String(raw.format_version)}.`);
    }
    return parseSelectedArchive(raw);
  }
  if (raw.export_type === 'session_transcript') {
    if (raw.format_version !== 1) {
      throw new Error(`Unsupported archive version ${String(raw.format_version)}.`);
    }
    const turns = parseExchanges(raw.exchanges);
    if (turns.length === 0) {
      throw new Error('The archive contains no restorable exchanges.');
    }
    return [{ title: cleanString(raw.session_id) || null, turns }];
  }
  throw new Error('This file is not a supported Arena transcript archive.');
}
