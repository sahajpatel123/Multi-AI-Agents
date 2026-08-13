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

/** One-on-one Discuss conversation as markdown. */
export function formatDiscussExport(opts: {
  agentName: string;
  originalPrompt: string;
  messages: ThreadMessage[];
}): string {
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const question = (opts.originalPrompt || '').trim() || '(no prompt)';
  const lines: string[] = [
    `# Arena Discuss — ${agentName}`,
    '',
    `**Original question:** ${question}`,
    '',
  ];

  const msgs = (opts.messages || []).filter(
    (m): m is ThreadMessage => Boolean(m),
  );
  if (msgs.length === 0) {
    lines.push('_No messages yet._');
  } else {
    for (const m of msgs) {
      const body = (m.content || '').trim();
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
  const challenged = (opts.challengedAgentName || 'Challenged mind').trim() || 'Challenged mind';
  const question = (opts.originalPrompt || '').trim() || '(no prompt)';
  const lines: string[] = [
    '# Arena Debate',
    '',
    `**Question:** ${question}`,
    '',
    `**Challenged:** ${challenged}`,
  ];
  const oneLiner = (opts.challengedOneLiner || '').trim();
  if (oneLiner) {
    lines.push(`> ${oneLiner}`);
  }
  lines.push('');

  const rounds = (opts.rounds || []).filter(
    (round): round is DebateExportRound => Boolean(round),
  );
  if (rounds.length === 0) {
    lines.push('_No rounds yet._');
  } else {
    for (const [index, round] of rounds.entries()) {
      // Defensive: malformed payloads (NaN/zero/negative) fall back to the
      // position in the list instead of printing "Round NaN/undefined".
      const roundNumber =
        Number.isFinite(round.roundNumber) && round.roundNumber > 0
          ? round.roundNumber
          : index + 1;
      lines.push(`## Round ${roundNumber}`);
      lines.push('');
      const interjection = (round.userInterjection || '').trim();
      if (interjection) {
        lines.push(`**Your interjection:** ${interjection}`);
        lines.push('');
      }
      const reactions = (round.reactions || []).filter(
        (r): r is DebateExportRound['reactions'][number] => Boolean(r),
      );
      if (reactions.length === 0) {
        lines.push('_(No reactions in this round.)_');
        lines.push('');
        continue;
      }
      for (const r of reactions) {
        const name = (r.agentName || 'Mind').trim() || 'Mind';
        const stance = (r.stance || '').trim();
        const header = stance ? `### ${name} (${stance})` : `### ${name}`;
        lines.push(header);
        lines.push('');
        lines.push((r.content || '').trim() || '_(empty)_');
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
  const agentName = (opts.agentName || 'Arena mind').trim() || 'Arena mind';
  const question = (opts.originalPrompt || '').trim() || '(no prompt)';
  const messages = (opts.messages || [])
    .filter((m): m is ThreadMessage => Boolean(m))
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'agent',
      content: (m.content || '').trim() || null,
    }))
    .filter((m) => m.content !== null);
  const data = {
    exported_from: 'arena',
    export_type: 'discuss_thread',
    format_version: 1,
    exported_at: opts.exportedAt || new Date().toISOString(),
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
  const challenged =
    (opts.challengedAgentName || 'Challenged mind').trim() || 'Challenged mind';
  const question = (opts.originalPrompt || '').trim() || '(no prompt)';
  const rounds = (opts.rounds || [])
    .filter((round): round is DebateExportRound => Boolean(round))
    .map((round, index) => {
      const roundNumber =
        Number.isFinite(round.roundNumber) && round.roundNumber > 0
          ? round.roundNumber
          : index + 1;
      const reactions = (round.reactions || [])
        .filter((r): r is DebateExportRound['reactions'][number] => Boolean(r))
        .map((r) => ({
          agent_name: (r.agentName || 'Mind').trim() || 'Mind',
          stance: (r.stance || '').trim() || null,
          content: (r.content || '').trim() || null,
        }));
      return {
        round_number: roundNumber,
        user_interjection: (round.userInterjection || '').trim() || null,
        reaction_count: reactions.length,
        reactions,
      };
    });
  const data = {
    exported_from: 'arena',
    export_type: 'debate_transcript',
    format_version: 1,
    exported_at: opts.exportedAt || new Date().toISOString(),
    question,
    challenged_agent_name: challenged,
    challenged_one_liner: (opts.challengedOneLiner || '').trim() || null,
    challenged_verdict: (opts.challengedVerdict || '').trim() || null,
    challenged_key_assumption: (opts.challengedKeyAssumption || '').trim() || null,
    round_count: rounds.length,
    rounds,
  };
  return JSON.stringify(data, null, 2) + '\n';
}
