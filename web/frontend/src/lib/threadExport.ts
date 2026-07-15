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
