/** Portable markdown for the session Agent Leaderboard. */

export type LeaderboardExportRow = {
  name: string;
  wins: number;
  percentage: number;
};

export type LeaderboardExportTurn = {
  prompt: string;
  winnerName: string;
  oneLiner?: string;
  /** Full winner take when available (preferred over one-liner in export). */
  fullTake?: string;
};

export function formatLeaderboardExport(opts: {
  rows: LeaderboardExportRow[];
  totalPrompts: number;
  turns?: LeaderboardExportTurn[];
}): string {
  const total = Math.max(0, Math.floor(opts.totalPrompts || 0));
  const lines: string[] = [
    '# Arena Agent Leaderboard',
    '',
    total === 0
      ? '_No prompts scored in this session yet._'
      : `Based on **${total}** ${total === 1 ? 'prompt' : 'prompts'} in this session.`,
    '',
  ];

  const rows = [...(opts.rows || [])].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.percentage - a.percentage;
  });

  if (rows.length === 0) {
    lines.push('_No minds ranked yet._');
  } else {
    lines.push('| Rank | Mind | Wins | Share |');
    lines.push('| ---: | --- | ---: | ---: |');
    rows.forEach((row, i) => {
      const name = (row.name || 'Mind').trim() || 'Mind';
      const wins = Math.max(0, Math.floor(row.wins || 0));
      const pct = Number.isFinite(row.percentage) ? Math.round(row.percentage) : 0;
      lines.push(`| ${i + 1} | ${name} | ${wins} | ${pct}% |`);
    });
  }

  const turns = opts.turns || [];
  if (turns.length > 0) {
    lines.push('');
    lines.push('## Session prompts');
    lines.push('');
    turns.forEach((turn, i) => {
      const prompt = (turn.prompt || '').trim() || '(no prompt)';
      const winner = (turn.winnerName || 'Mind').trim() || 'Mind';
      const fullTake = (turn.fullTake || '').trim();
      const oneLiner = (turn.oneLiner || '').trim();
      const take = fullTake || oneLiner;
      lines.push(`### ${i + 1}. ${prompt}`);
      lines.push('');
      lines.push(`**Winner:** ${winner}`);
      if (take) {
        lines.push('');
        if (fullTake && fullTake !== oneLiner && fullTake.includes('\n')) {
          lines.push(fullTake);
        } else {
          lines.push(`> ${take}`);
        }
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Shared from Arena_');
  return lines.join('\n').trim() + '\n';
}
