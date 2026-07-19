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
import {
  LEADERBOARD_MIND_ALL,
  filterLeaderboardTurnsByMind,
  formatLeaderboardPromptCopy,
  leaderboardMindFilterLabel,
  leaderboardMindFilterUseful,
  type LeaderboardMindFilter,
} from '../lib/leaderboardMindFilter';
import '../styles/leaderboard-view.css';

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
  const [mindFilter, setMindFilter] = useState<LeaderboardMindFilter>(LEADERBOARD_MIND_ALL);
  const [rowCopyStatus, setRowCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

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

  const mindFilterUseful = useMemo(
    () => leaderboardMindFilterUseful(turnSummaries),
    [turnSummaries],
  );

  // Drop mind filter if that mind no longer appears in the session.
  useEffect(() => {
    if (mindFilter === LEADERBOARD_MIND_ALL) return;
    if (!turnSummaries.some((t) => t.winnerId === mindFilter)) {
      setMindFilter(LEADERBOARD_MIND_ALL);
    }
  }, [mindFilter, turnSummaries]);

  const filteredTurnSummaries = useMemo(
    () => filterLeaderboardTurnsByMind(turnSummaries, mindFilter),
    [turnSummaries, mindFilter],
  );

  const mindFilterName = useMemo(
    () =>
      leaderboardMindFilterLabel(mindFilter, (id) => {
        const row = leaderboard.find((r) => r.agent_id === id);
        return row?.name || AGENTS[id]?.name || id;
      }),
    [mindFilter, leaderboard],
  );

  useEffect(() => {
    if (rowCopyStatus === 'idle') return;
    const hold = motionDuration(rowCopyStatus === 'copied' ? 1600 : 2400);
    const t = window.setTimeout(() => setRowCopyStatus('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [rowCopyStatus]);

  const buildSessionMarkdown = () =>
    formatLeaderboardExport({
      totalPrompts,
      rows: leaderboard.map((r) => ({
        name: r.name,
        wins: r.wins,
        percentage: r.percentage,
      })),
      turns: filteredTurnSummaries.map((t) => ({
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

  const copyPromptRow = async (t: (typeof turnSummaries)[number]) => {
    const md = formatLeaderboardPromptCopy({
      prompt: t.prompt,
      winnerName: t.winnerName,
      oneLiner: t.oneLiner,
      fullTake: t.fullTake,
    });
    const ok = await copyToClipboard(md);
    setRowCopyStatus(ok ? 'copied' : 'failed');
  };

  const toggleMindFilter = (agentId: string) => {
    setMindFilter((prev) => (prev === agentId ? LEADERBOARD_MIND_ALL : agentId));
    setExpandedTurnId(null);
  };

  const reduceMotion = prefersReducedMotion();

  return (
    <div
      className={[
        'leaderboard-container',
        reduceMotion ? 'leaderboard-container--static' : 'leaderboard-container--enter',
        visible || reduceMotion ? 'leaderboard-container--visible' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button type="button" onClick={onBack} className="lb-back">
        <ArrowLeft className="lb-back__icon" aria-hidden />
        Back to Arena
      </button>

      <header className="lb-hero">
        <div className="lb-hero__row">
          <div className="lb-hero__title-wrap">
            <span className="lb-hero__trophy" aria-hidden>
              <Trophy />
            </span>
            <h1 className="lb-hero__title">Agent Leaderboard</h1>
          </div>
          <div className="lb-hero__actions">
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              disabled={!hasData}
              className={`lb-ghost-btn${
                copyFeedback === 'copied'
                  ? ' lb-ghost-btn--ok'
                  : copyFeedback === 'failed'
                    ? ' lb-ghost-btn--err'
                    : ''
              }`}
              title={hasData ? 'Copy rankings and session prompts as markdown' : 'Prompt first to build rankings'}
              aria-label={
                copyFeedback === 'copied'
                  ? 'Session copied'
                  : copyFeedback === 'failed'
                    ? 'Copy failed'
                    : 'Copy rankings and session prompts as markdown'
              }
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
              className={`lb-ghost-btn${
                downloadFeedback === 'done'
                  ? ' lb-ghost-btn--ok'
                  : downloadFeedback === 'failed'
                    ? ' lb-ghost-btn--err'
                    : ''
              }`}
              title={hasData ? 'Download rankings and session prompts as markdown' : 'Prompt first to build rankings'}
              aria-label={
                downloadFeedback === 'done'
                  ? 'Session downloaded'
                  : downloadFeedback === 'failed'
                    ? 'Download failed'
                    : 'Download rankings and session prompts as markdown'
              }
            >
              {downloadFeedback === 'done'
                ? 'Downloaded'
                : downloadFeedback === 'failed'
                  ? 'Download failed'
                  : 'Download .md'}
            </button>
          </div>
        </div>
        <p className="lb-hero__lede">
          {hasData
            ? mindFilter !== LEADERBOARD_MIND_ALL
              ? `Showing wins by ${mindFilterName} · ${filteredTurnSummaries.length} of ${totalPrompts} ${totalPrompts === 1 ? 'prompt' : 'prompts'}`
              : `Based on ${totalPrompts} ${totalPrompts === 1 ? 'prompt' : 'prompts'} in this session${
                  mindFilterUseful ? ' · click a mind to filter prompts' : ''
                }`
            : 'Win rates will appear once you start prompting'}
        </p>
        {copyFeedback === 'failed' || downloadFeedback === 'failed' || rowCopyStatus === 'failed' ? (
          <p role="alert" className="lb-alert">
            Could not{' '}
            {copyFeedback === 'failed'
              ? 'copy session'
              : downloadFeedback === 'failed'
                ? 'download'
                : 'copy prompt'}{' '}
            — try again or select text manually.
          </p>
        ) : null}
        {rowCopyStatus === 'copied' ? (
          <p role="status" aria-live="polite" className="lb-status">
            Prompt copied.
          </p>
        ) : null}
      </header>

      <div className="lb-rule" role="separator" />

      {hasData ? (
        <div className="lb-ranks">
          {leaderboard.map((row, index) => {
            const isFirst = index === 0;
            const width = animatedWidths[row.agent_id] ?? 0;
            const isFiltered = mindFilter === row.agent_id;
            return (
              <div
                className={[
                  'agent-row',
                  isFirst ? 'agent-row--first' : '',
                  isFiltered ? 'agent-row--filtered' : '',
                  mindFilterUseful ? 'agent-row--interactive' : '',
                  reduceMotion ? 'agent-row--visible' : 'agent-row--enter',
                  visible || reduceMotion ? 'agent-row--visible' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={row.agent_id}
                role={mindFilterUseful ? 'button' : undefined}
                tabIndex={mindFilterUseful ? 0 : undefined}
                aria-pressed={mindFilterUseful ? isFiltered : undefined}
                title={
                  mindFilterUseful
                    ? isFiltered
                      ? `Clear filter · show all prompts`
                      : `Show prompts won by ${row.name}`
                    : undefined
                }
                onClick={() => {
                  if (mindFilterUseful) toggleMindFilter(row.agent_id);
                }}
                onKeyDown={(e) => {
                  if (!mindFilterUseful) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleMindFilter(row.agent_id);
                  }
                }}
                style={{
                  ['--row-accent' as string]: row.color,
                  transition: reduceMotion
                    ? 'none'
                    : `opacity 300ms ease ${index * 70}ms, transform 300ms ease ${index * 70}ms, background 150ms ease, border-color 150ms ease, box-shadow 180ms ease`,
                }}
              >
                <div className="agent-row__head">
                  <div className="agent-row__identity">
                    <span className="agent-row__rank">{RANK_LABELS[index]}</span>
                    <div className="agent-row__mind">
                      <AgentDot agentId={row.agent_id} size={isFirst ? 9 : 7} />
                      <span className="agent-row__name">{row.name}</span>
                    </div>
                  </div>

                  <div className="agent-row__stats">
                    <span
                      className={`agent-row__pct${showNumbers ? ' agent-row__pct--show' : ''}`}
                      style={{ color: row.color, transition: reduceMotion ? 'none' : undefined }}
                    >
                      {Math.round(row.percentage)}%
                    </span>
                    <span className={`win-badge${isFirst ? ' win-badge--lead' : ''}`}>
                      {row.wins} {row.wins === 1 ? 'win' : 'wins'}
                    </span>
                  </div>
                </div>

                <div className="agent-row__bar-row">
                  <div className="agent-row__bar-track">
                    <div
                      className="agent-row__bar-fill"
                      style={{
                        width: `${width}%`,
                        background: row.color,
                        transition: barTransition,
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
        <section className="lb-prompts">
          <div className="lb-prompts__head">
            <div className="lb-prompts__label">
              Session prompts
              {mindFilter !== LEADERBOARD_MIND_ALL
                ? ` · ${filteredTurnSummaries.length}/${turnSummaries.length}`
                : ''}
            </div>
            {mindFilter !== LEADERBOARD_MIND_ALL ? (
              <button
                type="button"
                className="lb-text-btn"
                onClick={() => setMindFilter(LEADERBOARD_MIND_ALL)}
              >
                Show all minds
              </button>
            ) : null}
          </div>
          {filteredTurnSummaries.length === 0 ? (
            <div className="lb-prompts__empty">
              No prompts won by {mindFilterName} in this session.
              <button
                type="button"
                className="lb-text-btn"
                onClick={() => setMindFilter(LEADERBOARD_MIND_ALL)}
              >
                Show all prompts
              </button>
            </div>
          ) : (
            <div className="lb-prompts__list">
              {filteredTurnSummaries.map((t, index) => {
                const turnKey = t.turnId || `turn-${index}`;
                const isExpanded = expandedTurnId === turnKey;
                const showFull = isExpanded && t.canExpand && Boolean(t.fullTake);
                return (
                  <article
                    key={turnKey}
                    className={`lb-prompt-card${isExpanded ? ' lb-prompt-card--open' : ''}`}
                  >
                    <div className="lb-prompt-card__q">{t.prompt || '(no prompt)'}</div>
                    <div
                      className="lb-prompt-card__winner"
                      style={{ marginBottom: t.oneLiner || t.fullTake ? 6 : 0 }}
                    >
                      <span className="lb-prompt-card__winner-label">Winner</span>
                      <AgentDot agentId={t.winnerId} size={7} />
                      <span className="lb-prompt-card__winner-name">{t.winnerName}</span>
                    </div>
                    {showFull ? (
                      <AgentAnswerMarkdown markdown={t.fullTake} question={t.prompt || undefined} />
                    ) : t.oneLiner || t.fullTake ? (
                      <p className="lb-prompt-card__blurb">
                        “{t.oneLiner || t.fullTake}”
                      </p>
                    ) : null}
                    <div className="lb-prompt-card__actions">
                      {t.canExpand ? (
                        <button
                          type="button"
                          className="lb-text-btn"
                          onClick={() =>
                            setExpandedTurnId((id) => (id === turnKey ? null : turnKey))
                          }
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Show less' : 'Show full take'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="lb-text-btn"
                        onClick={() => void copyPromptRow(t)}
                      >
                        Copy prompt
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {!hasData ? (
        <div className="lb-empty">
          <div className="lb-empty__icon" aria-hidden>
            <Trophy />
          </div>
          <p className="lb-empty__title">No data yet</p>
          <p className="lb-empty__body">
            Ask your first question in the Arena and this leaderboard will start tracking who wins.
          </p>
          <button type="button" onClick={onBack} className="lb-empty__cta">
            Go to Arena
          </button>
        </div>
      ) : null}

      {hasData && topAgent && topAgent.wins > 0 ? (
        <div className="lb-lead-chip">
          <AgentDot agentId={topAgent.agent_id} size={6} />
          <p>
            <span className="lb-lead-chip__name">{topAgent.name}</span>
            {' '}is currently leading with{' '}
            <span className="lb-lead-chip__rate">
              {Math.round(topAgent.percentage)}% win rate
            </span>
            {' '}across {totalPrompts} {totalPrompts === 1 ? 'prompt' : 'prompts'}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
