import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { AGENTS, type SessionTurn } from '../types';
import { AgentAnswerMarkdown } from './AgentAnswerMarkdown';
import { AgentDot } from './AgentDot';
import { usePanel } from '../context/PanelContext';
import {
  arenaFullTakeExpandable,
  pickArenaTakeBody,
} from '../lib/arenaTakeClipboard';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatLeaderboardExport } from '../lib/leaderboardExport';

interface LeaderboardViewProps {
  turns: SessionTurn[];
  onBack: () => void;
}

const RANK_LABELS = ['#1', '#2', '#3', '#4'];
const AGENT_SLOT_IDS = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;

type LeaderboardRow = {
  agent_id: string;
  name: string;
  color: string;
  wins: number;
  percentage: number;
};

export function LeaderboardView({ turns, onBack }: LeaderboardViewProps) {
  const { panel } = usePanel();
  const [animatedWidths, setAnimatedWidths] = useState<Record<string, number>>({});
  const [showNumbers, setShowNumbers] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadFeedback, setDownloadFeedback] = useState<'idle' | 'done' | 'failed'>('idle');
  const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);

  const leaderboard = useMemo(() => {
    const winsByAgent = turns.reduce<Record<string, number>>((acc, turn) => {
      acc[turn.winner_id] = (acc[turn.winner_id] || 0) + 1;
      return acc;
    }, {});

    const rows: LeaderboardRow[] = AGENT_SLOT_IDS.map((agentId, i) => {
      const persona = panel[i];
      const fallback = AGENTS[agentId];
      const wins = winsByAgent[agentId] || 0;
      const percentage = turns.length > 0 ? (wins / turns.length) * 100 : 0;
      return {
        agent_id: agentId,
        name: persona?.name || fallback?.name || agentId,
        color: persona?.color || fallback?.color || '#6B6460',
        wins,
        percentage,
      };
    });

    return rows.sort((a, b) => b.wins - a.wins);
  }, [turns, panel]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    setAnimatedWidths({});
    setShowNumbers(reduced);
    setVisible(reduced);

    if (reduced) {
      setAnimatedWidths(
        leaderboard.reduce<Record<string, number>>((acc, row) => {
          acc[row.agent_id] = row.percentage;
          return acc;
        }, {}),
      );
      setVisible(true);
      return;
    }

    const frameId = requestAnimationFrame(() => setVisible(true));

    const barTimer = window.setTimeout(() => {
      setAnimatedWidths(
        leaderboard.reduce<Record<string, number>>((acc, row) => {
          acc[row.agent_id] = row.percentage;
          return acc;
        }, {}),
      );
    }, motionDuration(60));

    const numTimer = window.setTimeout(() => setShowNumbers(true), motionDuration(680));

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(barTimer);
      window.clearTimeout(numTimer);
    };
  }, [leaderboard]);

  const totalPrompts = turns.length;
  const topAgent = leaderboard[0];
  const hasData = totalPrompts > 0;
  const barTransition = prefersReducedMotion()
    ? 'none'
    : 'width 800ms cubic-bezier(0.16,1,0.3,1)';

  useEffect(() => {
    if (copyFeedback === 'idle') return;
    const hold = motionDuration(copyFeedback === 'copied' ? 1600 : 2400);
    const t = window.setTimeout(() => setCopyFeedback('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [copyFeedback]);

  useEffect(() => {
    if (downloadFeedback === 'idle') return;
    const hold = motionDuration(downloadFeedback === 'done' ? 1600 : 2400);
    const t = window.setTimeout(() => setDownloadFeedback('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [downloadFeedback]);

  // Escape returns to Arena (skip when a modal dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const turnSummaries = useMemo(() => {
    const nameById = new Map(leaderboard.map((r) => [r.agent_id, r.name]));
    return (turns || []).map((t) => {
      const winnerId = t.winner_id;
      const winnerName =
        nameById.get(winnerId) ||
        AGENTS[winnerId]?.name ||
        winnerId ||
        'Mind';
      const winnerResponse = t.agent_responses?.[winnerId];
      const oneLiner = (winnerResponse?.one_liner || '').trim();
      const verdict = (winnerResponse?.verdict || '').trim();
      const fullTake = pickArenaTakeBody({ oneLiner, verdict });
      const canExpand = arenaFullTakeExpandable({ oneLiner, verdict });
      return {
        turnId: t.turn_id,
        prompt: (t.prompt || '').trim(),
        winnerId,
        winnerName,
        oneLiner,
        fullTake,
        canExpand,
      };
    });
  }, [turns, leaderboard]);

  const buildSessionMarkdown = () =>
    formatLeaderboardExport({
      totalPrompts,
      rows: leaderboard.map((r) => ({
        name: r.name,
        wins: r.wins,
        percentage: r.percentage,
      })),
      turns: turnSummaries.map((t) => ({
        prompt: t.prompt,
        winnerName: t.winnerName,
        oneLiner: t.oneLiner,
        fullTake: t.fullTake,
      })),
    });

  const handleCopy = async () => {
    const ok = await copyToClipboard(buildSessionMarkdown());
    setCopyFeedback(ok ? 'copied' : 'failed');
  };

  const handleDownload = () => {
    const ok = downloadMarkdownFile(buildSessionMarkdown(), 'arena-session-leaderboard');
    setDownloadFeedback(ok ? 'done' : 'failed');
  };

  return (
    <div
      className="leaderboard-container"
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '32px 24px 64px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: prefersReducedMotion() ? 'none' : 'opacity 300ms ease, transform 300ms ease',
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'transparent',
          border: 'none',
          padding: '4px 0',
          fontSize: '13px',
          color: '#8A8078',
          cursor: 'pointer',
          marginBottom: '28px',
          transition: 'color 150ms ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#1A1714')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8A8078')}
      >
        <ArrowLeft style={{ width: '14px', height: '14px' }} aria-hidden />
        Back to Arena
      </button>

      <div style={{ marginBottom: '36px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: '6px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trophy style={{ width: '20px', height: '20px', color: '#C4956A', flexShrink: 0 }} aria-hidden />
            <h1 style={{ fontSize: '22px', fontWeight: 500, color: '#1A1714', letterSpacing: '-0.02em', margin: 0 }}>
              Agent Leaderboard
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!hasData}
              title={hasData ? 'Copy rankings and session prompts as markdown' : 'Prompt first to build rankings'}
              aria-label={
                copyFeedback === 'copied'
                  ? 'Session copied'
                  : copyFeedback === 'failed'
                    ? 'Copy failed'
                    : 'Copy rankings and session prompts as markdown'
              }
              style={{
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                color:
                  copyFeedback === 'failed'
                    ? '#993C1D'
                    : !hasData
                      ? '#A89070'
                      : '#C4956A',
                background: 'none',
                border: '0.5px solid #E0D8D0',
                borderRadius: 999,
                padding: '5px 12px',
                cursor: hasData ? 'pointer' : 'not-allowed',
                opacity: hasData ? 1 : 0.7,
              }}
            >
              {copyFeedback === 'copied'
                ? 'Copied'
                : copyFeedback === 'failed'
                  ? 'Copy failed'
                  : 'Copy session'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!hasData}
              title={hasData ? 'Download rankings and session prompts as markdown' : 'Prompt first to build rankings'}
              aria-label={
                downloadFeedback === 'done'
                  ? 'Session downloaded'
                  : downloadFeedback === 'failed'
                    ? 'Download failed'
                    : 'Download rankings and session prompts as markdown'
              }
              style={{
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                color:
                  downloadFeedback === 'failed'
                    ? '#993C1D'
                    : !hasData
                      ? '#A89070'
                      : '#C4956A',
                background: 'none',
                border: '0.5px solid #E0D8D0',
                borderRadius: 999,
                padding: '5px 12px',
                cursor: hasData ? 'pointer' : 'not-allowed',
                opacity: hasData ? 1 : 0.7,
              }}
            >
              {downloadFeedback === 'done'
                ? 'Downloaded'
                : downloadFeedback === 'failed'
                  ? 'Download failed'
                  : 'Download .md'}
            </button>
          </div>
        </div>
        <p style={{ fontSize: '13px', color: '#9A9088', margin: 0 }}>
          {hasData
            ? `Based on ${totalPrompts} ${totalPrompts === 1 ? 'prompt' : 'prompts'} in this session`
            : 'Win rates will appear once you start prompting'}
        </p>
        {copyFeedback === 'failed' || downloadFeedback === 'failed' ? (
          <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: '8px 0 0' }}>
            Could not {copyFeedback === 'failed' ? 'copy' : 'download'} — try again or select text manually.
          </p>
        ) : null}
      </div>

      <div style={{ height: '0.5px', background: '#E8E0D8', marginBottom: '32px' }} />

      {hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {leaderboard.map((row, index) => {
            const isFirst = index === 0;
            const width = animatedWidths[row.agent_id] ?? 0;

            return (
              <div
                className="agent-row"
                key={row.agent_id}
                style={{
                  padding: '18px 20px',
                  borderRadius: '14px',
                  background: isFirst ? '#FFFFFF' : 'transparent',
                  border: isFirst ? '0.5px solid #E0D8D0' : '0.5px solid transparent',
                  marginBottom: '8px',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(6px)',
                  transition: prefersReducedMotion()
                    ? 'none'
                    : `opacity 300ms ease ${index * 70}ms, transform 300ms ease ${index * 70}ms, background 150ms ease`,
                  boxShadow: isFirst ? '0 2px 12px rgba(26,23,20,0.06)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isFirst ? '#C4956A' : '#B0A898',
                        letterSpacing: '0.05em',
                        width: '20px',
                        flexShrink: 0,
                      }}
                    >
                      {RANK_LABELS[index]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AgentDot agentId={row.agent_id} size={isFirst ? 9 : 7} />
                      <span
                        style={{
                          fontSize: isFirst ? '15px' : '14px',
                          fontWeight: isFirst ? 500 : 400,
                          color: '#1A1714',
                        }}
                      >
                        {row.name}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        opacity: showNumbers ? 1 : 0,
                        transition: prefersReducedMotion() ? 'none' : 'opacity 200ms ease',
                        fontSize: '12px',
                        color: row.color,
                        fontWeight: 500,
                        minWidth: '32px',
                        textAlign: 'right',
                      }}
                    >
                      {Math.round(row.percentage)}%
                    </span>
                    <span
                      className="win-badge"
                      style={{
                        background: isFirst ? '#F5EEE6' : '#F0EBE3',
                        border: `0.5px solid ${isFirst ? 'rgba(196,149,106,0.2)' : '#E0D8D0'}`,
                        borderRadius: '999px',
                        padding: '3px 10px',
                        fontSize: '12px',
                        color: isFirst ? '#C4956A' : '#6B6460',
                        fontWeight: isFirst ? 500 : 400,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.wins} {row.wins === 1 ? 'win' : 'wins'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      flex: 1,
                      height: isFirst ? '4px' : '3px',
                      background: '#F0EBE3',
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: '100%',
                        background: row.color,
                        borderRadius: '999px',
                        transition: barTransition,
                        opacity: isFirst ? 1 : 0.7,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {hasData && turnSummaries.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#A89070',
              marginBottom: 12,
            }}
          >
            Session prompts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {turnSummaries.map((t, index) => {
              const turnKey = t.turnId || `turn-${index}`;
              const isExpanded = expandedTurnId === turnKey;
              const showFull = isExpanded && t.canExpand && Boolean(t.fullTake);
              return (
              <div
                key={turnKey}
                style={{
                  background: '#FFFFFF',
                  border: isExpanded ? '0.5px solid rgba(196,149,106,0.55)' : '0.5px solid #E8E0D8',
                  borderRadius: 12,
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: '#1A1714',
                    lineHeight: 1.45,
                    marginBottom: 8,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {t.prompt || '(no prompt)'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    marginBottom: t.oneLiner || t.fullTake ? 6 : 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#A89070',
                    }}
                  >
                    Winner
                  </span>
                  <AgentDot agentId={t.winnerId} size={7} />
                  <span style={{ fontSize: 12, color: '#4A3728', fontWeight: 500 }}>{t.winnerName}</span>
                </div>
                {showFull ? (
                  <AgentAnswerMarkdown markdown={t.fullTake} question={t.prompt || undefined} />
                ) : t.oneLiner || t.fullTake ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: '#6B6460',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                    }}
                  >
                    “{t.oneLiner || t.fullTake}”
                  </p>
                ) : null}
                {t.canExpand ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTurnId((id) => (id === turnKey ? null : turnKey))
                    }
                    aria-expanded={isExpanded}
                    style={{
                      marginTop: 8,
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: '#C4956A',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {isExpanded ? 'Show less' : 'Show full take'}
                  </button>
                ) : null}
              </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!hasData ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '60px 24px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '0.5px solid #E8E0D8',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: '#F5EEE6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <Trophy style={{ width: '22px', height: '22px', color: '#C4956A' }} aria-hidden />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: '#1A1714', margin: '0 0 6px' }}>
            No data yet
          </p>
          <p
            style={{
              fontSize: '13px',
              color: '#9A9088',
              textAlign: 'center',
              margin: 0,
              maxWidth: '260px',
              lineHeight: '1.6',
            }}
          >
            Ask your first question in the Arena and this leaderboard will start tracking who wins.
          </p>
          <button
            type="button"
            onClick={onBack}
            style={{
              marginTop: '24px',
              padding: '8px 20px',
              borderRadius: '999px',
              background: '#1A1714',
              color: '#FAF7F4',
              border: 'none',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'opacity 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Go to Arena
          </button>
        </div>
      ) : null}

      {hasData && topAgent && topAgent.wins > 0 && (
        <div
          style={{
            marginTop: '28px',
            padding: '14px 18px',
            borderRadius: '10px',
            background: 'transparent',
            border: '0.5px solid #E8E0D8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AgentDot agentId={topAgent.agent_id} size={6} />
          <p style={{ fontSize: '12px', color: '#9A9088', margin: 0 }}>
            <span style={{ color: '#1A1714', fontWeight: 500 }}>{topAgent.name}</span>
            {' '}is currently leading with{' '}
            <span style={{ color: '#C4956A', fontWeight: 500 }}>
              {Math.round(topAgent.percentage)}% win rate
            </span>
            {' '}across {totalPrompts} {totalPrompts === 1 ? 'prompt' : 'prompts'}.
          </p>
        </div>
      )}
    </div>
  );
}
