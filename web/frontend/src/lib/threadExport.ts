/**
 * Portable markdown exports for Discuss + Debate threads
 * (parity with Arena "Copy all takes").
 */

export type ThreadMessage = {
  role: 'user' | 'agent';
  content: string;
};

export type DebateExportRound = {
  roundNumber: number;
  userInterjection?: string;
  reactions: Array<{
    agentName: string;
    content: string;
    stance?: string;
  }>;
};

/**
 * Normalize a payload field for export. Values that are not strings are
 * treated as empty so a malformed response can never crash the exporter —
 * the caller decides whether an empty result means null or a fallback.
 */
function toTrimmedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** One-on-one Discuss conversation as markdown. */
export function formatDiscussExport(opts: {
  agentName: string;
  originalPrompt: string;
  messages: ThreadMessage[];
}): string {
  const agentName = toTrimmedText(opts.agentName) || 'Arena mind';
  const question = toTrimmedText(opts.originalPrompt) || '(no prompt)';
  const lines: string[] = [
    `# Arena Discuss — ${agentName}`,
    '',
    `**Original question:** ${question}`,
    '',
  ];

  const msgs = (Array.isArray(opts.messages) ? opts.messages : []).filter(
    (m): m is ThreadMessage => Boolean(m),
  );
  if (msgs.length === 0) {
    lines.push('_No messages yet._');
  } else {
    for (const m of msgs) {
      const body = toTrimmedText(m.content);
      if (!body) continue;
      if (m.role === 'user') {
        lines.push(`**You:** ${body}`);
      } else {
        lines.push(`**${agentName}:** ${body}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('_Shared from Arena Discuss_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Clipboard text for a single Discuss message (user or agent).
 * Prefer plain content for user notes; agent takes include attribution.
 */
export function formatDiscussMessageCopy(opts: {
  role: 'user' | 'agent';
  content: string;
  agentName?: string | null;
  originalPrompt?: string | null;
  /** When true, include the original Arena question as context. */
  includeQuestion?: boolean;
}): string {
  const body = (opts.content || '').trim();
  if (!body) return '';
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const lines: string[] = [];

  if (opts.includeQuestion) {
    const q = (opts.originalPrompt || '').trim();
    if (q) {
      lines.push(`**Question:** ${q}`);
      lines.push('');
    }
  }

  if (opts.role === 'user') {
    lines.push(body);
  } else {
    lines.push(`**${agentName}:**`);
    lines.push('');
    lines.push(body);
  }

  return lines.join('\n').trim() + '\n';
}

/** Multi-round Debate colosseum as markdown. */
export function formatDebateExport(opts: {
  originalPrompt: string;
  challengedAgentName: string;
  challengedOneLiner?: string;
  rounds: DebateExportRound[];
}): string {
  const challenged = toTrimmedText(opts.challengedAgentName) || 'Challenged mind';
  const question = toTrimmedText(opts.originalPrompt) || '(no prompt)';
  const lines: string[] = [
    '# Arena Debate',
    '',
    `**Question:** ${question}`,
    '',
    `**Challenged:** ${challenged}`,
  ];
  const oneLiner = toTrimmedText(opts.challengedOneLiner);
  if (oneLiner) {
    lines.push(`> ${oneLiner}`);
  }
  lines.push('');

  const rounds = (Array.isArray(opts.rounds) ? opts.rounds : []).filter(
    (round): round is DebateExportRound => Boolean(round),
  );
  if (rounds.length === 0) {
    lines.push('_No rounds yet._');
  } else {
    for (const [index, round] of rounds.entries()) {
      // Defensive: malformed payloads (NaN/zero/negative) fall back to the
      // position in the list instead of printing "Round NaN/undefined".
      const rawRoundNumber =
        typeof round.roundNumber === 'number'
          ? round.roundNumber
          : typeof round.roundNumber === 'string'
            ? Number(round.roundNumber)
            : Number.NaN;
      const roundNumber =
        Number.isFinite(rawRoundNumber) && rawRoundNumber > 0
          ? rawRoundNumber
          : index + 1;
      lines.push(`## Round ${roundNumber}`);
      lines.push('');
      const interjection = toTrimmedText(round.userInterjection);
      if (interjection) {
        lines.push(`**Your interjection:** ${interjection}`);
        lines.push('');
      }
      const reactions = (Array.isArray(round.reactions) ? round.reactions : []).filter(
        (r): r is DebateExportRound['reactions'][number] => Boolean(r),
      );
      if (reactions.length === 0) {
        lines.push('_(No reactions in this round.)_');
        lines.push('');
        continue;
      }
      for (const r of reactions) {
        const name = toTrimmedText(r.agentName) || 'Mind';
        const stance = toTrimmedText(r.stance);
        const header = stance ? `### ${name} (${stance})` : `### ${name}`;
        lines.push(header);
        lines.push('');
        lines.push(toTrimmedText(r.content) || '_(empty)_');
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('_Shared from Arena Debate_');
  return lines.join('\n').trim() + '\n';
}

/**
 * Clipboard text for a single Debate reaction (one mind's take in a round).
 * Includes stance when present; optional question + round for context.
 */
export function formatDebateReactionCopy(opts: {
  agentName?: string | null;
  content: string;
  stance?: string | null;
  originalPrompt?: string | null;
  roundNumber?: number | null;
  /** When true, include the original Arena question as context. */
  includeQuestion?: boolean;
}): string {
  const body = (opts.content || '').trim();
  if (!body) return '';
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const lines: string[] = [];

  if (opts.includeQuestion) {
    const q = (opts.originalPrompt || '').trim();
    if (q) {
      lines.push(`**Question:** ${q}`);
      lines.push('');
    }
  }

  if (opts.roundNumber != null && Number.isFinite(opts.roundNumber)) {
    lines.push(`**Round ${opts.roundNumber}**`);
    lines.push('');
  }

  const stance = (opts.stance || '').trim();
  const header = stance ? `**${agentName}** (${stance})` : `**${agentName}:**`;
  lines.push(header);
  lines.push('');
  lines.push(body);

  return lines.join('\n').trim() + '\n';
}

/** Clipboard text for a user's debate interjection (plain, with optional round). */
export function formatDebateInterjectionCopy(opts: {
  content: string;
  roundNumber?: number | null;
}): string {
  const body = (opts.content || '').trim();
  if (!body) return '';
  if (opts.roundNumber != null && Number.isFinite(opts.roundNumber)) {
    return `**Round ${opts.roundNumber} — You:**\n\n${body}\n`;
  }
  return `${body}\n`;
}

/**
 * Clipboard text for the challenged mind's opening take in the colosseum.
 */
export function formatDebateChallengedCopy(opts: {
  agentName?: string | null;
  content: string;
  oneLiner?: string | null;
  keyAssumption?: string | null;
  originalPrompt?: string | null;
  includeQuestion?: boolean;
}): string {
  const body = (opts.content || '').trim();
  const oneLiner = (opts.oneLiner || '').trim();
  const take = body || oneLiner;
  if (!take) return '';

  const agentName = (opts.agentName || 'Challenged mind').trim() || 'Challenged mind';
  const lines: string[] = [];

  if (opts.includeQuestion) {
    const q = (opts.originalPrompt || '').trim();
    if (q) {
      lines.push(`**Question:** ${q}`);
      lines.push('');
    }
  }

  lines.push(`**${agentName}** (challenged)`);
  lines.push('');
  lines.push(take);

  const assumption = (opts.keyAssumption || '').trim();
  if (assumption) {
    lines.push('');
    lines.push(`**Key assumption:** ${assumption}`);
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Structured JSON export of a 1-on-1 Discuss thread. Preserves message
 * bodies verbatim (trimmed) so the archive can be re-imported or diffed,
 * and skips null/whitespace-only entries exactly like the markdown export.
 *
 * Deterministic except for the optional exported-at timestamp: pass
 * ``opts.exportedAt`` to pin it (tests do this); otherwise the caller gets
 * the current UTC ISO timestamp.
 */
export function formatDiscussJsonExport(opts: {
  agentName: string;
  originalPrompt: string;
  messages: ThreadMessage[];
  exportedAt?: string;
}): string {
  const agentName = toTrimmedText(opts.agentName) || 'Arena mind';
  const question = toTrimmedText(opts.originalPrompt) || '(no prompt)';
  const exportedAt = toTrimmedText(opts.exportedAt) || new Date().toISOString();
  const messages = (Array.isArray(opts.messages) ? opts.messages : [])
    .filter((m): m is ThreadMessage => Boolean(m))
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'agent',
      content: toTrimmedText(m.content) || null,
    }))
    .filter((m) => m.content !== null);
  const data = {
    exported_from: 'arena',
    export_type: 'discuss_thread',
    format_version: 1,
    exported_at: exportedAt,
    agent_name: agentName,
    original_prompt: question,
    message_count: messages.length,
    messages,
  };
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Structured JSON export of a multi-round Debate colosseum. Mirrors the
 * markdown transcript but keeps every field machine-readable, including the
 * challenged take's verdict and key assumption. Malformed rounds/reactions
 * are normalized (never NaN/undefined), matching the markdown exporter.
 *
 * Deterministic except for the optional exported-at timestamp: pass
 * ``opts.exportedAt`` to pin it (tests do this); otherwise the caller gets
 * the current UTC ISO timestamp.
 */
export function formatDebateJsonExport(opts: {
  originalPrompt: string;
  challengedAgentName: string;
  challengedOneLiner?: string;
  challengedVerdict?: string;
  challengedKeyAssumption?: string;
  rounds: DebateExportRound[];
  exportedAt?: string;
}): string {
  const challenged = toTrimmedText(opts.challengedAgentName) || 'Challenged mind';
  const question = toTrimmedText(opts.originalPrompt) || '(no prompt)';
  const exportedAt = toTrimmedText(opts.exportedAt) || new Date().toISOString();
  const rounds = (Array.isArray(opts.rounds) ? opts.rounds : [])
    .filter((round): round is DebateExportRound => Boolean(round))
    .map((round, index) => {
      const rawRoundNumber =
        typeof round.roundNumber === 'number'
          ? round.roundNumber
          : typeof round.roundNumber === 'string'
            ? Number(round.roundNumber)
            : Number.NaN;
      const roundNumber =
        Number.isFinite(rawRoundNumber) && rawRoundNumber > 0
          ? rawRoundNumber
          : index + 1;
      const reactions = (Array.isArray(round.reactions) ? round.reactions : [])
        .filter((r): r is DebateExportRound['reactions'][number] => Boolean(r))
        .map((r) => ({
          agent_name: toTrimmedText(r.agentName) || 'Mind',
          stance: toTrimmedText(r.stance) || null,
          content: toTrimmedText(r.content) || null,
        }));
      return {
        round_number: roundNumber,
        user_interjection: toTrimmedText(round.userInterjection) || null,
        reaction_count: reactions.length,
        reactions,
      };
    });
  const data = {
    exported_from: 'arena',
    export_type: 'debate_transcript',
    format_version: 1,
    exported_at: exportedAt,
    question,
    challenged_agent_name: challenged,
    challenged_one_liner: toTrimmedText(opts.challengedOneLiner) || null,
    challenged_verdict: toTrimmedText(opts.challengedVerdict) || null,
    challenged_key_assumption: toTrimmedText(opts.challengedKeyAssumption) || null,
    round_count: rounds.length,
    rounds,
  };
  return JSON.stringify(data, null, 2) + '\n';
}
