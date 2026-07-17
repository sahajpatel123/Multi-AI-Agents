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

  const msgs = opts.messages || [];
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

  const rounds = opts.rounds || [];
  if (rounds.length === 0) {
    lines.push('_No rounds yet._');
  } else {
    for (const round of rounds) {
      lines.push(`## Round ${round.roundNumber}`);
      lines.push('');
      const interjection = (round.userInterjection || '').trim();
      if (interjection) {
        lines.push(`**Your interjection:** ${interjection}`);
        lines.push('');
      }
      for (const r of round.reactions || []) {
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
