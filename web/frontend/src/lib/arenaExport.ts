import type { PromptResponse, ScoredAgent, SessionTurn } from '../types';
import { copyToClipboard } from './clipboard';

export type ArenaExportPersona = {
  name: string;
  color?: string;
};

export type ArenaTranscriptOptions = {
  /** Pin the export timestamp (tests use this); defaults to the current UTC time. */
  exportedAt?: string;
  /** Optional session id included in the header so archives keep provenance. */
  sessionId?: string;
};

export type ArenaTranscriptBundle = {
  /** Source session id, kept for provenance when available. */
  sessionId?: string | null;
  /** Optional user-facing title used in the combined archive index. */
  title?: string | null;
  /** Full stored turn list for one resumable chat. */
  turns: SessionTurn[];
};

/**
 * Payload built before handing the winning Arena take to Agent Mode. The
 * backend caps both text fields at 2000 chars, so the frontend trims to the
 * same bound instead of letting an oversized verdict produce a 422.
 */
export type ArenaVerifyBridgePayload = {
  answer: string;
  question: string;
  personaName: string;
  score: number;
};

const MAX_VERIFY_TEXT_LENGTH = 2000;
const MAX_VERIFY_PERSONA_LENGTH = 100;

/**
 * Build a safe Agent Mode bridge payload from a winning Arena take. Falls
 * back from the one-liner to the full verdict, rejects completely empty takes,
 * and normalizes question/persona/score so the backend contract is never
 * surprised by missing or malformed values.
 */
export function buildArenaVerifyBridgePayload(
  scoredAgent: ScoredAgent,
  question: string,
  personaName: string,
): ArenaVerifyBridgePayload | null {
  const oneLiner = (scoredAgent.response.one_liner || '').trim();
  const answer = oneLiner || (scoredAgent.response.verdict || '').trim();
  if (!answer) return null;
  return {
    answer: answer.slice(0, MAX_VERIFY_TEXT_LENGTH),
    question: (question || '').trim().slice(0, MAX_VERIFY_TEXT_LENGTH) || 'Arena discussion',
    personaName: (personaName || 'Arena winner').trim().slice(0, MAX_VERIFY_PERSONA_LENGTH),
    score: Number.isFinite(scoredAgent.score) ? scoredAgent.score : 0,
  };
}

/**
 * Make a user-controlled chat title safe for use as a Markdown heading.
 * Newlines and repeated whitespace are collapsed so a title cannot inject
 * extra blocks into the combined archive, and a leading ATX marker is
 * stripped so the title renders as the section label it is.
 */
export function sanitizeArenaTranscriptTitle(raw: string): string {
  return (raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#{1,6}\s*/, '');
}

/**
 * Pick the winning scored take from an Arena response.
 * Prefers `is_winner`, then `winner_agent_id`, then highest score.
 */
export function pickArenaWinner(response: PromptResponse): ScoredAgent | null {
  const rows = response.all_responses || [];
  if (!rows.length) return null;
  const flagged = rows.find((r) => r.is_winner);
  if (flagged) return flagged;
  const byId = response.winner_agent_id
    ? rows.find((r) => r.response.agent_id === response.winner_agent_id)
    : null;
  if (byId) return byId;
  return [...rows].sort((a, b) => b.score - a.score)[0] ?? null;
}

/**
 * Portable markdown for just the winning mind — for notes, docs, and quick share.
 */
export function formatArenaWinnerExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const winner = pickArenaWinner(response);
  if (!winner) {
    return [
      '# Arena · Winner',
      '',
      `**Question:** ${(response.prompt || '').trim() || '(no prompt)'}`,
      '',
      '_No winning take available yet._',
      '',
      '---',
      '_Shared from Arena_',
      '',
    ].join('\n');
  }

  const persona = resolvePersona(winner.response.agent_id);
  const name = persona.name || winner.response.agent_id;
  const score =
    typeof winner.score === 'number' && Number.isFinite(winner.score)
      ? Math.round(winner.score)
      : null;
  const oneLiner = (winner.response.one_liner || '').trim();
  const verdict = (winner.response.verdict || '').trim();
  const assumption = (winner.response.key_assumption || '').trim();

  const lines: string[] = [
    `# ${name} · Arena winner`,
    '',
    `**Question:** ${(response.prompt || '').trim() || '(no prompt)'}`,
    '',
  ];
  if (score != null) {
    lines.push(`**Score:** ${score}`, '');
  }
  if (oneLiner) {
    lines.push(`> ${oneLiner}`, '');
  }
  if (verdict && verdict !== oneLiner) {
    lines.push('## Full take', '', verdict, '');
  } else if (!oneLiner && verdict) {
    lines.push('## Full take', '', verdict, '');
  }
  if (assumption) {
    lines.push(`_Key assumption:_ ${assumption}`, '');
  }
  lines.push('---', '_Shared from Arena (winner only)_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Portable markdown transcript of an entire Arena session, one section per
 * exchange. Covers every stored turn (prompt, all four takes, winner badge,
 * confidence, key assumption) plus per-exchange timestamps and an optional
 * session id, so a user can archive or share a whole conversation, not just
 * the latest round.
 *
 * Deterministic except for the optional exported-at timestamp: pass
 * ``opts.exportedAt`` to pin it (tests do this); otherwise the caller gets
 * the current UTC ISO timestamp.
 */
export function formatArenaTranscriptExport(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: ArenaTranscriptOptions,
): string {
  const exchanges = turns ?? [];
  const lines: string[] = ['# Arena — session transcript', ''];
  if (opts?.sessionId) {
    lines.push(`**Session:** ${opts.sessionId}`, '');
  }
  lines.push(
    `**Exported:** ${opts?.exportedAt || new Date().toISOString()}`,
    `**Exchanges:** ${exchanges.length}`,
    '',
  );

  if (!exchanges.length) {
    lines.push('_No exchanges in this session yet._', '', '---', '_Shared from Arena_');
    return lines.join('\n').trim() + '\n';
  }

  exchanges.forEach((turn, index) => {
    const category = (turn.prompt_category || '').trim();
    lines.push(`## Exchange ${index + 1}${category ? ` · ${category}` : ''}`, '');
    const timestamp = pickExchangeTimestamp(turn);
    if (timestamp) {
      lines.push(`**Time:** ${timestamp}`, '');
    }
    const prompt = (turn.prompt || '').trim().replace(/\s*\n\s*/g, ' ') || '(no prompt)';
    lines.push(`**Question:** ${prompt}`, '');

    const entries = Object.values(turn.agent_responses || {});
    if (!entries.length) {
      lines.push('_No agent takes recorded for this exchange._', '');
    }
    const winnerId = turn.winner_id;
    const sorted = [...entries].sort((a, b) => {
      const aWinner = a.agent_id === winnerId ? 1 : 0;
      const bWinner = b.agent_id === winnerId ? 1 : 0;
      if (aWinner !== bWinner) return bWinner - aWinner;
      return a.agent_id.localeCompare(b.agent_id);
    });

    for (const agentResponse of sorted) {
      const persona = resolvePersona(agentResponse.agent_id);
      const name = persona.name || agentResponse.agent_id;
      const badge = agentResponse.agent_id === winnerId ? ' · winner' : '';
      const confidence =
        typeof agentResponse.confidence === 'number' &&
        Number.isFinite(agentResponse.confidence)
          ? ` · confidence ${agentResponse.confidence}`
          : '';
      const oneLiner =
        (agentResponse.one_liner || '').trim().replace(/\s*\n\s*/g, ' ') || '_(no one-liner)_';
      const verdict = (agentResponse.verdict || '').trim();
      const assumption = (agentResponse.key_assumption || '').trim();

      lines.push(`### ${name}${badge}${confidence}`, '', oneLiner);
      if (verdict && verdict !== oneLiner) {
        lines.push('', `**Verdict:** ${verdict}`);
      }
      if (assumption) {
        lines.push('', `_Key assumption:_ ${assumption}`);
      }
      lines.push('');
    }

    if (index < exchanges.length - 1) {
      lines.push('---', '');
    }
  });

  lines.push('---', '_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Copy the full-session Markdown transcript to the clipboard. Reuses the
 * download formatter so copy and download stay byte-for-byte in sync, and
 * returns the clipboard helper's success flag for UI feedback.
 */
export async function copyArenaTranscriptToClipboard(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: ArenaTranscriptOptions,
): Promise<boolean> {
  return copyToClipboard(formatArenaTranscriptExport(turns, resolvePersona, opts));
}

/**
 * Copy the full-session JSON transcript to the clipboard. Reuses the
 * download formatter so copy and download stay byte-for-byte in sync, and
 * returns the clipboard helper's success flag for UI feedback.
 */
export async function copyArenaTranscriptJsonToClipboard(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: ArenaTranscriptOptions,
): Promise<boolean> {
  return copyToClipboard(formatArenaTranscriptJsonExport(turns, resolvePersona, opts));
}

/**
 * Copy a combined full-transcript Markdown archive to the clipboard. Reuses
 * the download formatter so copy and download stay byte-for-byte in sync,
 * and returns the clipboard helper's success flag for UI feedback.
 */
export async function copyArenaTranscriptsToClipboard(
  bundles: ArenaTranscriptBundle[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: { exportedAt?: string },
): Promise<boolean> {
  return copyToClipboard(formatArenaTranscriptsExport(bundles, resolvePersona, opts));
}

/**
 * Portable markdown archive of several full chat transcripts in one file.
 * Each chat is rendered with the same transcript formatter used by the
 * Arena view, prefixed by an index section so the combined export stays
 * scannable and keeps provenance for every included session. The archive
 * header and every included transcript share the same exported-at timestamp.
 */
export function formatArenaTranscriptsExport(
  bundles: ArenaTranscriptBundle[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: { exportedAt?: string },
): string {
  const chats = (bundles || []).filter(
    (bundle) => bundle && Array.isArray(bundle.turns),
  );
  const exportedAt = opts?.exportedAt || new Date().toISOString();
  const lines: string[] = [
    '# Arena — selected chat transcripts',
    '',
    `**Chats:** ${chats.length}`,
    `**Exported:** ${exportedAt}`,
    '',
  ];

  chats.forEach((bundle, index) => {
    const title =
      sanitizeArenaTranscriptTitle(bundle.title || '') ||
      sanitizeArenaTranscriptTitle(bundle.sessionId || '') ||
      `Chat ${index + 1}`;
    lines.push(`## ${index + 1}. ${title}`, '');
    const transcript = formatArenaTranscriptExport(
      bundle.turns,
      resolvePersona,
      {
        sessionId: bundle.sessionId || undefined,
        exportedAt,
      },
    );
    lines.push(transcript.trim());
    if (index < chats.length - 1) {
      lines.push('', '---', '');
    }
  });

  lines.push('', '---', '_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Prefer the exchange's own timestamp; fall back to the newest stored take
 * timestamp when the turn-level field is empty (older/partial session data).
 */
function pickExchangeTimestamp(turn: SessionTurn): string {
  const own = (turn.timestamp || '').trim();
  if (own) return own;
  const responseTimes = Object.values(turn.agent_responses || {})
    .map((response) => (response.timestamp || '').trim())
    .filter(Boolean);
  responseTimes.sort();
  return responseTimes[responseTimes.length - 1] || '';
}

/**
 * Structured JSON transcript of an entire Arena session — one object per
 * exchange with the prompt, category, timestamp, winner, and every stored
 * take. Mirrors ``formatArenaTranscriptExport`` but stays machine-readable
 * (multiline prompts and verdicts are preserved verbatim), so the archive
 * can be re-imported, analyzed, or diffed later. The envelope carries a
 * ``format_version`` so consumers can detect incompatible archive shapes,
 * and a stale ``winner_id`` that matches no stored take is dropped rather
 * than exported as an inconsistent winner with no matching ``is_winner``.
 *
 * Deterministic except for the optional exported-at timestamp: pass
 * ``opts.exportedAt`` to pin it (tests do this); otherwise the caller gets
 * the current UTC ISO timestamp.
 */
function buildArenaTranscriptJson(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: ArenaTranscriptOptions,
): Record<string, unknown> {
  const exchanges = turns ?? [];
  const data = {
    exported_from: 'arena',
    export_type: 'session_transcript',
    format_version: 1,
    exported_at: opts?.exportedAt || new Date().toISOString(),
    session_id: opts?.sessionId || null,
    exchange_count: exchanges.length,
    exchanges: exchanges.map((turn) => {
      const entries = Object.values(turn.agent_responses || {});
      const winnerId =
        turn.winner_id && entries.some((entry) => entry.agent_id === turn.winner_id)
          ? turn.winner_id
          : '';
      const sorted = [...entries].sort((a, b) => {
        const aWinner = a.agent_id === winnerId ? 1 : 0;
        const bWinner = b.agent_id === winnerId ? 1 : 0;
        if (aWinner !== bWinner) return bWinner - aWinner;
        return a.agent_id.localeCompare(b.agent_id);
      });
      return {
        turn_id: turn.turn_id || '',
        prompt: (turn.prompt || '').trim() || '(no prompt)',
        prompt_category: (turn.prompt_category || '').trim() || null,
        timestamp: pickExchangeTimestamp(turn) || null,
        winner_agent_id: winnerId || null,
        takes: sorted.map((agentResponse) => {
          const persona = resolvePersona(agentResponse.agent_id) || {};
          return {
            agent_id: agentResponse.agent_id,
            agent_name: persona.name || agentResponse.agent_id,
            is_winner: agentResponse.agent_id === winnerId,
            confidence:
              typeof agentResponse.confidence === 'number' &&
              Number.isFinite(agentResponse.confidence)
                ? agentResponse.confidence
                : null,
            one_liner: (agentResponse.one_liner || '').trim() || null,
            verdict: (agentResponse.verdict || '').trim() || null,
            key_assumption: (agentResponse.key_assumption || '').trim() || null,
            timestamp: (agentResponse.timestamp || '').trim() || null,
          };
        }),
      };
    }),
  };
  return data;
}

export function formatArenaTranscriptJsonExport(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: ArenaTranscriptOptions,
): string {
  return JSON.stringify(buildArenaTranscriptJson(turns, resolvePersona, opts), null, 2) + '\n';
}

/**
 * Structured JSON archive of several full chat transcripts in one file.
 * Each chat is wrapped with its session id and user-facing title, then the
 * same machine-readable transcript shape used by the single-chat JSON export,
 * so a combined backup can be re-imported, diffed, or analyzed as one unit.
 *
 * Deterministic except for the optional exported-at timestamp: pass
 * ``opts.exportedAt`` to pin it (tests do this); otherwise the caller gets
 * the current UTC ISO timestamp. The archive envelope and every included
 * transcript share the same exported-at timestamp.
 */
export function formatArenaTranscriptsJsonExport(
  bundles: ArenaTranscriptBundle[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: { exportedAt?: string },
): string {
  const chats = (bundles || []).filter(
    (bundle) => bundle && Array.isArray(bundle.turns),
  );
  const exportedAt = opts?.exportedAt || new Date().toISOString();
  const data = {
    exported_from: 'arena',
    export_type: 'selected_chat_transcripts',
    format_version: 1,
    exported_at: exportedAt,
    chat_count: chats.length,
    chats: chats.map((bundle, index) => {
      const title =
        sanitizeArenaTranscriptTitle(bundle.title || '') ||
        sanitizeArenaTranscriptTitle(bundle.sessionId || '') ||
        `Chat ${index + 1}`;
      return {
        index: index + 1,
        session_id: bundle.sessionId || null,
        title,
        transcript: buildArenaTranscriptJson(bundle.turns, resolvePersona, {
          sessionId: bundle.sessionId || undefined,
          exportedAt,
        }),
      };
    }),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Build a portable markdown comparison of all four Arena takes.
 * Used by "Copy all takes" so users can paste into notes, docs, or share channels.
 */
export function formatArenaExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const lines: string[] = [];
  lines.push('# Arena — four minds');
  lines.push('');
  lines.push(`**Question:** ${(response.prompt || '').trim() || '(no prompt)'}`);
  lines.push('');

  const sorted = [...response.all_responses].sort((a, b) => {
    if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1;
    return b.score - a.score;
  });

  for (const scored of sorted) {
    lines.push(formatAgentBlock(scored, resolvePersona(scored.response.agent_id)));
    lines.push('');
  }

  lines.push('---');
  lines.push('_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Structured JSON for a full Arena round (all takes, winner, scores).
 */
export function formatArenaJsonExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
  opts?: { exportedAt?: string },
): string {
  const winner = pickArenaWinner(response);
  const sorted = [...response.all_responses].sort((a, b) => {
    if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1;
    return b.score - a.score;
  });
  const data = {
    exported_from: 'arena',
    exported_at: opts?.exportedAt || new Date().toISOString(),
    session_id: response.session_id,
    prompt: (response.prompt || '').trim() || '(no prompt)',
    prompt_category: response.prompt_category,
    winner_agent_id: winner?.response.agent_id ?? response.winner_agent_id ?? null,
    tools_used: Array.isArray(response.tools_used) ? response.tools_used : [],
    timestamp: response.timestamp || '',
    integrity: response.integrity || null,
    takes: sorted.map((scored) => {
      const persona = resolvePersona(scored.response.agent_id);
      return {
        agent_id: scored.response.agent_id,
        agent_name: persona.name || scored.response.agent_id,
        is_winner: scored.is_winner,
        score:
          typeof scored.score === 'number' && Number.isFinite(scored.score)
            ? scored.score
            : null,
        confidence:
          typeof scored.response.confidence === 'number' &&
          Number.isFinite(scored.response.confidence)
            ? scored.response.confidence
            : null,
        one_liner: (scored.response.one_liner || '').trim() || null,
        verdict: (scored.response.verdict || '').trim() || null,
        key_assumption: (scored.response.key_assumption || '').trim() || null,
        contradiction: scored.contradiction || null,
      };
    }),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Characters that, when they appear as the first character of a CSV cell,
 * cause Excel / Google Sheets / LibreOffice to evaluate the cell as a
 * formula. OWASP CSV Injection guidance: prefix any cell that begins with
 * one of these with a single quote to neutralize the formula (CWE-1236).
 *
 * Arena prompts and verdicts are user- and model-controlled text, so they
 * must never be able to turn a downloaded transcript into an executable
 * spreadsheet payload for the next analyst who opens it.
 */
const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function toCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value == null ? '' : String(value);
  const safe =
    raw && CSV_FORMULA_PREFIXES.includes(raw[0]) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * CSV export for a full Arena round (one row per take).
 */
export function formatArenaCsvExport(
  response: PromptResponse,
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const sorted = [...response.all_responses].sort((a, b) => {
    if (a.is_winner !== b.is_winner) return a.is_winner ? -1 : 1;
    return b.score - a.score;
  });
  const headers = [
    'agentName',
    'prompt',
    'oneLiner',
    'verdict',
    'score',
    'confidence',
    'winner',
    'keyAssumption',
  ];
  const lines: string[] = [headers.map(toCsvCell).join(',')];
  for (const scored of sorted) {
    const persona = resolvePersona(scored.response.agent_id);
    lines.push(
      [
        persona.name || scored.response.agent_id,
        (response.prompt || '').trim() || '(no prompt)',
        (scored.response.one_liner || '').trim(),
        (scored.response.verdict || '').trim(),
        typeof scored.score === 'number' && Number.isFinite(scored.score) ? scored.score : '',
        typeof scored.response.confidence === 'number' && Number.isFinite(scored.response.confidence)
          ? scored.response.confidence
          : '',
        scored.is_winner ? 'yes' : 'no',
        (scored.response.key_assumption || '').trim(),
      ]
        .map(toCsvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Flat CSV transcript of an entire Arena session — one row per stored take,
 * with the exchange's prompt, category, timestamp, and winner repeated on
 * each row so spreadsheets can filter, pivot, and chart without joins.
 * Mirrors the Markdown/JSON transcripts: winner-first ordering per exchange,
 * stale winner ids dropped, and every cell quoted/escaped for CSV consumers.
 * Multiline prompts and verdicts are preserved inside quoted cells.
 */
export function formatArenaTranscriptCsvExport(
  turns: SessionTurn[],
  resolvePersona: (agentId: string) => ArenaExportPersona,
): string {
  const exchanges = turns ?? [];
  const headers = [
    'exchange',
    'turnId',
    'timestamp',
    'prompt',
    'promptCategory',
    'winnerAgentId',
    'agentId',
    'agentName',
    'isWinner',
    'confidence',
    'oneLiner',
    'verdict',
    'keyAssumption',
    'agentTimestamp',
  ];
  const lines: string[] = [headers.map(toCsvCell).join(',')];

  exchanges.forEach((turn, index) => {
    const entries = Object.values(turn.agent_responses || {});
    const winnerId =
      turn.winner_id && entries.some((entry) => entry.agent_id === turn.winner_id)
        ? turn.winner_id
        : '';
    const sorted = [...entries].sort((a, b) => {
      const aWinner = a.agent_id === winnerId ? 1 : 0;
      const bWinner = b.agent_id === winnerId ? 1 : 0;
      if (aWinner !== bWinner) return bWinner - aWinner;
      return a.agent_id.localeCompare(b.agent_id);
    });
    const exchangeTimestamp = pickExchangeTimestamp(turn);

    for (const agentResponse of sorted) {
      const persona = resolvePersona(agentResponse.agent_id) || {};
      lines.push(
        [
          index + 1,
          turn.turn_id || '',
          exchangeTimestamp,
          (turn.prompt || '').trim() || '(no prompt)',
          (turn.prompt_category || '').trim(),
          winnerId,
          agentResponse.agent_id,
          persona.name || agentResponse.agent_id,
          agentResponse.agent_id === winnerId ? 'yes' : 'no',
          typeof agentResponse.confidence === 'number' && Number.isFinite(agentResponse.confidence)
            ? agentResponse.confidence
            : '',
          (agentResponse.one_liner || '').trim(),
          (agentResponse.verdict || '').trim(),
          (agentResponse.key_assumption || '').trim(),
          (agentResponse.timestamp || '').trim(),
        ]
          .map(toCsvCell)
          .join(','),
      );
    }
  });

  return lines.join('\n') + '\n';
}

function formatAgentBlock(scored: ScoredAgent, persona: ArenaExportPersona): string {
  const name = persona.name || scored.response.agent_id;
  const badge = scored.is_winner ? ' · winner' : '';
  const score =
    typeof scored.score === 'number' && Number.isFinite(scored.score)
      ? ` · score ${Math.round(scored.score)}`
      : '';
  const oneLiner = (scored.response.one_liner || '').trim() || '_(no one-liner)_';
  const verdict = (scored.response.verdict || '').trim();

  const parts = [`## ${name}${badge}${score}`, '', oneLiner];
  if (verdict && verdict !== oneLiner) {
    parts.push('', `**Verdict:** ${verdict}`);
  }
  return parts.join('\n');
}
