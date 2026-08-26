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

/**
 * Spreadsheet-ready export for the session leaderboard.
 *
 * Ranking and prompt rows share one rectangular schema so the file remains
 * easy to filter after opening in a spreadsheet. User- and model-controlled
 * text is quoted and neutralized against spreadsheet formula injection.
 */
export function formatLeaderboardCsv(opts: {
  rows: LeaderboardExportRow[];
  turns?: LeaderboardExportTurn[];
}): string {
  const csvFormulaPrefixes: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];

  const csvSafe = (value: string | number | boolean | null | undefined): string => {
    const raw = value == null ? '' : String(value);
    const firstSignificant = raw.trimStart()[0] || '';
    return csvFormulaPrefixes.includes(firstSignificant) ? `'${raw}` : raw;
  };

  const csvCell = (value: string | number | boolean | null | undefined): string =>
    `"${csvSafe(value).replace(/"/g, '""')}"`;

  const rows = [...(opts.rows || [])].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.percentage - a.percentage;
  });
  const headers = [
    'record_type',
    'rank',
    'mind',
    'wins',
    'share_percent',
    'prompt',
    'winner',
    'take',
  ];
  const lines: string[] = [headers.map(csvCell).join(',')];

  rows.forEach((row, index) => {
    lines.push(
      [
        'ranking',
        index + 1,
        (row.name || 'Mind').trim() || 'Mind',
        Math.max(0, Math.floor(row.wins || 0)),
        Number.isFinite(row.percentage) ? Number(row.percentage.toFixed(3)) : 0,
        '',
        '',
        '',
      ]
        .map(csvCell)
        .join(','),
    );
  });

  (opts.turns || []).forEach((turn) => {
    lines.push(
      [
        'prompt',
        '',
        '',
        '',
        '',
        (turn.prompt || '').trim() || '(no prompt)',
        (turn.winnerName || 'Mind').trim() || 'Mind',
        (turn.fullTake || turn.oneLiner || '').trim(),
      ]
        .map(csvCell)
        .join(','),
    );
  });

  // BOM + CRLF keeps Unicode prompts legible in Excel and follows RFC 4180
  // conventions used by the other Arena CSV exports.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
