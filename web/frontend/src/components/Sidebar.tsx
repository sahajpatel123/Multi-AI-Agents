import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Icons } from './Icons';
import {
  Ellipsis,
  Trophy,
  Sparkles,
  LayoutGrid,
  HelpCircle,
  CheckSquare,
  MessageSquare,
  Swords,
  Bookmark,
  Pencil,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AGENTS, type PromptCategory, type SavedResponseItem } from '../types';
import { AgentDot } from './AgentDot';
import { HighlightQuery } from './HighlightQuery';
import { usePanel } from '../context/PanelContext';
import { useTier } from '../context/TierContext';
import { useAuth } from '../hooks/useAuth';
import { useProfileModal } from '../context/ProfileModalContext';
import track from '../utils/track';
import { filterBySearchQuery, filterTurnsBySearchQuery } from '../lib/sidebarSearch';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatRelativePast } from '../lib/relativeTime';
import { formatArenaRecentsExport } from '../lib/arenaRecentsExport';
import { formatSavedTakeExport, formatSavedTakesListExport } from '../lib/savedTakeExport';
import { motionDuration } from '../lib/motion';
import {
  SIDEBAR_RECENTS_SORT_OPTIONS,
  SIDEBAR_SAVED_SORT_OPTIONS,
  sidebarRecentsSortLabel,
  sidebarSavedSortLabel,
  sortSidebarRecents,
  sortSidebarSaved,
  type SidebarRecentsSort,
  type SidebarSavedSort,
} from '../lib/sidebarListSort';
import {
  SIDEBAR_SAVED_MIND_ALL,
  collectSavedMindFilterOptions,
  filterSavedByMind,
  sidebarSavedMindFilterLabel,
  type SidebarSavedMindFilter,
} from '../lib/sidebarSavedMindFilter';
import {
  SIDEBAR_RECENTS_WINNER_ALL,
  collectRecentsWinnerFilterOptions,
  filterRecentsByWinner,
  sidebarRecentsWinnerFilterLabel,
  type SidebarRecentsWinnerFilter,
} from '../lib/sidebarRecentsWinnerFilter';
import {
  AGENT_HISTORY_SCORE_OPTIONS,
  agentHistoryScoreFilterUseful,
  agentHistoryScoreLabel,
  filterAgentHistoryByScore,
  type AgentHistoryScoreFilter,
} from '../lib/agentHistoryScoreFilter';
import {
  AGENT_HISTORY_RECENCY_OPTIONS,
  agentHistoryRecencyFilterUseful,
  agentHistoryRecencyLabel,
  filterAgentHistoryByRecency,
  type AgentHistoryRecencyFilter,
} from '../lib/agentHistoryRecencyFilter';
import {
  SIDEBAR_TURN_TITLE_MAX,
  loadSidebarTurnTitles,
  saveSidebarTurnTitle,
  sidebarTurnTitleIssueMessage,
  validateSidebarTurnTitle,
} from '../lib/sidebarTurnTitles';

interface SidebarTurn {
  turn_id: string;
  prompt: string;
  prompt_category?: string;
  winner_id: string;
  timestamp: string;
}

interface SidebarProps {
  turns: SidebarTurn[];
  activeTurnId: string | null;
  onTurnClick: (turnId: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
  onLeaderboardClick: () => void;
  savedItems: SavedResponseItem[];
  onSavedItemClick: (item: SavedResponseItem) => void;
}

type FilterValue = 'all' | PromptCategory;

const FILTERS: Array<{ value: FilterValue; label: string; icon: ReactNode }> = [
  { value: 'all', label: 'All', icon: <LayoutGrid className="w-[15px] h-[15px]" /> },
  { value: 'question', label: 'Question', icon: <HelpCircle className="w-[15px] h-[15px]" /> },
  { value: 'task', label: 'Task', icon: <CheckSquare className="w-[15px] h-[15px]" /> },
  { value: 'statement', label: 'Statement', icon: <MessageSquare className="w-[15px] h-[15px]" /> },
  { value: 'debate', label: 'Debate', icon: <Swords className="w-[15px] h-[15px]" /> },
];

export function Sidebar({
  turns,
  activeTurnId,
  onTurnClick,
  onNewChat,
  isOpen,
  onClose,
  onLeaderboardClick,
  savedItems,
  onSavedItemClick,
}: SidebarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openModal } = useProfileModal();
  const { isDefaultPanel, resetPanel, panel } = usePanel();
  const { messagesRemaining, dailyLimit, tier, isFree } = useTier();
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [recentsSort, setRecentsSort] = useState<SidebarRecentsSort>('newest');
  const [savedSort, setSavedSort] = useState<SidebarSavedSort>('newest');
  const [savedMindFilter, setSavedMindFilter] =
    useState<SidebarSavedMindFilter>(SIDEBAR_SAVED_MIND_ALL);
  const [savedScoreFilter, setSavedScoreFilter] =
    useState<AgentHistoryScoreFilter>('all');
  const [savedRecencyFilter, setSavedRecencyFilter] =
    useState<AgentHistoryRecencyFilter>('all');
  const [recentsWinnerFilter, setRecentsWinnerFilter] =
    useState<SidebarRecentsWinnerFilter>(SIDEBAR_RECENTS_WINNER_ALL);
  const [recentsRecencyFilter, setRecentsRecencyFilter] =
    useState<AgentHistoryRecencyFilter>('all');
  const [copiedSavedId, setCopiedSavedId] = useState<string | number | null>(null);
  const [copySavedFailed, setCopySavedFailed] = useState(false);
  const [copyAllSavedStatus, setCopyAllSavedStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadAllSavedStatus, setDownloadAllSavedStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [copyRecentsStatus, setCopyRecentsStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadRecentsStatus, setDownloadRecentsStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [openMenuTurnId, setOpenMenuTurnId] = useState<string | null>(null);
  const [confirmDeleteTurnId, setConfirmDeleteTurnId] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [customTitles, setCustomTitles] = useState<Record<string, string>>(() =>
    loadSidebarTurnTitles(),
  );
  const [deletedTurnIds, setDeletedTurnIds] = useState<Set<string>>(new Set());
  const renameCancelledRef = useRef(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const savedSearchInputRef = useRef<HTMLInputElement>(null);

  const winnerNameByAgentId = useMemo(() => {
    const map: Record<string, string> = {};
    const slotIds = ['agent_1', 'agent_2', 'agent_3', 'agent_4'] as const;
    slotIds.forEach((id, i) => {
      map[id] = panel[i]?.name || AGENTS[id]?.name || id;
    });
    return map;
  }, [panel]);

  const reversedTurns = useMemo(
    () => [...turns].reverse().filter((turn) => !deletedTurnIds.has(turn.turn_id)),
    [turns, deletedTurnIds],
  );

  const filteredTurns = useMemo(() => {
    const byCategory = reversedTurns.filter(
      (turn) => activeFilter === 'all' || turn.prompt_category === activeFilter,
    );
    const withTitles = byCategory.map((turn) => ({
      ...turn,
      title: customTitles[turn.turn_id],
      winnerName: winnerNameByAgentId[turn.winner_id] || AGENTS[turn.winner_id]?.name || turn.winner_id,
    }));
    const byWinner = filterRecentsByWinner(withTitles, recentsWinnerFilter);
    const byRecency = filterAgentHistoryByRecency(
      byWinner.map((turn) => ({
        ...turn,
        created_at: turn.timestamp,
      })),
      recentsRecencyFilter,
    );
    const searched = filterTurnsBySearchQuery(byRecency, searchQuery);
    return sortSidebarRecents(searched, recentsSort);
  }, [
    activeFilter,
    reversedTurns,
    searchQuery,
    customTitles,
    recentsSort,
    winnerNameByAgentId,
    recentsWinnerFilter,
    recentsRecencyFilter,
  ]);

  const recentsWinnerOptions = useMemo(() => {
    const withNames = reversedTurns.map((turn) => ({
      ...turn,
      winnerName: winnerNameByAgentId[turn.winner_id] || AGENTS[turn.winner_id]?.name || turn.winner_id,
    }));
    return collectRecentsWinnerFilterOptions(
      withNames,
      (winnerId) => winnerNameByAgentId[winnerId] || AGENTS[winnerId]?.name,
    );
  }, [reversedTurns, winnerNameByAgentId]);

  const recentsRecencyFilterUseful = useMemo(
    () =>
      agentHistoryRecencyFilterUseful(
        reversedTurns.map((turn) => ({ created_at: turn.timestamp })),
      ),
    [reversedTurns],
  );

  const reversedSaved = useMemo(() => [...savedItems].reverse(), [savedItems]);
  const savedMindOptions = useMemo(
    () =>
      collectSavedMindFilterOptions(reversedSaved, (agentId) => AGENTS[agentId]?.name),
    [reversedSaved],
  );
  const filteredSaved = useMemo(() => {
    const byMind = filterSavedByMind(reversedSaved, savedMindFilter);
    const byScore = filterAgentHistoryByScore(byMind, savedScoreFilter);
    const byRecency = filterAgentHistoryByRecency(
      byScore.map((item) => ({
        ...item,
        created_at: item.timestamp,
      })),
      savedRecencyFilter,
    );
    const searched = filterBySearchQuery(byRecency, savedSearchQuery, (item) => [
      item.one_liner,
      item.prompt,
      item.verdict,
      item.persona_name,
      AGENTS[item.agent_id]?.name,
    ]);
    return sortSidebarSaved(
      searched.map((item) => ({
        ...item,
        mindName: item.persona_name || AGENTS[item.agent_id]?.name || item.agent_id,
      })),
      savedSort,
    );
  }, [
    reversedSaved,
    savedSearchQuery,
    savedSort,
    savedMindFilter,
    savedScoreFilter,
    savedRecencyFilter,
  ]);

  const savedScoreFilterUseful = useMemo(
    () => agentHistoryScoreFilterUseful(reversedSaved),
    [reversedSaved],
  );

  const savedRecencyFilterUseful = useMemo(
    () =>
      agentHistoryRecencyFilterUseful(
        reversedSaved.map((item) => ({ created_at: item.timestamp })),
      ),
    [reversedSaved],
  );

  // Drop mind filter when that mind no longer has any saved takes.
  useEffect(() => {
    if (savedMindFilter === SIDEBAR_SAVED_MIND_ALL) return;
    if (!savedMindOptions.some((o) => o.value === savedMindFilter)) {
      setSavedMindFilter(SIDEBAR_SAVED_MIND_ALL);
    }
  }, [savedMindFilter, savedMindOptions]);

  // Drop winner filter when that winner no longer appears in recents.
  useEffect(() => {
    if (recentsWinnerFilter === SIDEBAR_RECENTS_WINNER_ALL) return;
    if (!recentsWinnerOptions.some((o) => o.value === recentsWinnerFilter)) {
      setRecentsWinnerFilter(SIDEBAR_RECENTS_WINNER_ALL);
    }
  }, [recentsWinnerFilter, recentsWinnerOptions]);

  useEffect(() => {
    if (copiedSavedId == null && !copySavedFailed) return;
    const hold = motionDuration(copySavedFailed ? 2200 : 1600);
    const t = window.setTimeout(() => {
      setCopiedSavedId(null);
      setCopySavedFailed(false);
    }, hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [copiedSavedId, copySavedFailed]);

  useEffect(() => {
    if (copyAllSavedStatus === 'idle') return;
    const hold = motionDuration(copyAllSavedStatus === 'failed' ? 2800 : 2000);
    const t = window.setTimeout(() => setCopyAllSavedStatus('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [copyAllSavedStatus]);

  useEffect(() => {
    if (downloadAllSavedStatus === 'idle') return;
    const hold = motionDuration(downloadAllSavedStatus === 'failed' ? 2800 : 2000);
    const t = window.setTimeout(() => setDownloadAllSavedStatus('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [downloadAllSavedStatus]);

  useEffect(() => {
    if (copyRecentsStatus === 'idle') return;
    const hold = motionDuration(copyRecentsStatus === 'failed' ? 2800 : 2000);
    const t = window.setTimeout(() => setCopyRecentsStatus('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [copyRecentsStatus]);

  useEffect(() => {
    if (downloadRecentsStatus === 'idle') return;
    const hold = motionDuration(downloadRecentsStatus === 'failed' ? 2800 : 2000);
    const t = window.setTimeout(() => setDownloadRecentsStatus('idle'), hold > 0 ? hold : 0);
    return () => window.clearTimeout(t);
  }, [downloadRecentsStatus]);

  const handleCopySaved = async (item: SavedResponseItem, displayName: string) => {
    const md = formatSavedTakeExport({
      agentName: displayName,
      prompt: item.prompt,
      oneLiner: item.one_liner,
      verdict: item.verdict,
      score: item.score,
    });
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopySavedFailed(false);
      setCopiedSavedId(item.id);
      void track('saved_take_copied', undefined, item.agent_id);
    } else {
      setCopiedSavedId(null);
      setCopySavedFailed(true);
    }
  };

  const buildSavedTakesMarkdown = () => {
    const q = savedSearchQuery.trim();
    const filterBits: string[] = [];
    if (savedMindFilter !== SIDEBAR_SAVED_MIND_ALL) {
      filterBits.push(
        `mind: ${sidebarSavedMindFilterLabel(savedMindFilter, savedMindOptions)}`,
      );
    }
    if (savedScoreFilter !== 'all') {
      filterBits.push(`score: ${agentHistoryScoreLabel(savedScoreFilter)}`);
    }
    if (savedRecencyFilter !== 'all') {
      filterBits.push(`recency: ${agentHistoryRecencyLabel(savedRecencyFilter)}`);
    }
    if (q) filterBits.push(`search “${q}”`);
    if (savedSort !== 'newest') filterBits.push(`sort: ${sidebarSavedSortLabel(savedSort)}`);
    return formatSavedTakesListExport({
      totalCount: savedItems.length,
      filterNote: filterBits.length ? filterBits.join(' · ') : undefined,
      items: filteredSaved.map((item) => {
        const agent = AGENTS[item.agent_id];
        return {
          agentName: item.persona_name || agent?.name || item.agent_id || 'Mind',
          prompt: item.prompt,
          oneLiner: item.one_liner,
          verdict: item.verdict,
          score: item.score,
          timestamp: item.timestamp,
        };
      }),
    });
  };

  const handleCopyAllSaved = async () => {
    const md = buildSavedTakesMarkdown();
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopySavedFailed(false);
      setCopyAllSavedStatus('copied');
      void track('saved_takes_list_copied');
    } else {
      setCopyAllSavedStatus('failed');
      setCopySavedFailed(true);
    }
  };

  const handleDownloadAllSaved = () => {
    const md = buildSavedTakesMarkdown();
    const ok = downloadMarkdownFile(md, 'arena-saved-takes');
    setDownloadAllSavedStatus(ok ? 'done' : 'failed');
    if (ok) void track('saved_takes_list_downloaded');
  };

  const buildRecentsMarkdown = () => {
    const parts: string[] = [];
    if (activeFilter !== 'all') {
      parts.push(`category ${activeFilter.charAt(0).toUpperCase()}${activeFilter.slice(1)}`);
    }
    if (recentsWinnerFilter !== SIDEBAR_RECENTS_WINNER_ALL) {
      parts.push(
        `winner: ${sidebarRecentsWinnerFilterLabel(recentsWinnerFilter, recentsWinnerOptions)}`,
      );
    }
    if (recentsRecencyFilter !== 'all') {
      parts.push(`recency: ${agentHistoryRecencyLabel(recentsRecencyFilter)}`);
    }
    const q = searchQuery.trim();
    if (q) parts.push(`search “${q}”`);
    if (recentsSort !== 'newest') parts.push(`sort: ${sidebarRecentsSortLabel(recentsSort)}`);
    return formatArenaRecentsExport({
      totalCount: reversedTurns.length,
      filterNote: parts.length > 0 ? parts.join(' · ') : undefined,
      items: filteredTurns.map((turn) => ({
        title: customTitles[turn.turn_id] || undefined,
        prompt: turn.prompt,
        category: turn.prompt_category,
        winnerName:
          turn.winnerName || AGENTS[turn.winner_id]?.name || turn.winner_id || undefined,
        timestamp: turn.timestamp,
        turnId: turn.turn_id,
      })),
    });
  };

  const handleCopyRecents = async () => {
    const md = buildRecentsMarkdown();
    const ok = await copyToClipboard(md);
    setCopyRecentsStatus(ok ? 'copied' : 'failed');
    if (ok) void track('arena_recents_copied');
  };

  const handleDownloadRecents = () => {
    const md = buildRecentsMarkdown();
    const ok = downloadMarkdownFile(md, 'arena-recents');
    setDownloadRecentsStatus(ok ? 'done' : 'failed');
    if (ok) void track('arena_recents_downloaded');
  };

  const usedPercent = dailyLimit > 0
    ? Math.min(((dailyLimit - messagesRemaining) / dailyLimit) * 100, 100)
    : 0;
  const usageColor = messagesRemaining <= 2 ? '#E57373' : '#C4956A';

  useEffect(() => {
    if (!openMenuTurnId && !confirmDeleteTurnId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (menuLayerRef.current?.contains(event.target as Node)) return;
      setOpenMenuTurnId(null);
      setConfirmDeleteTurnId(null);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openMenuTurnId, confirmDeleteTurnId]);

  useEffect(() => {
    if (!editingTurnId) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingTurnId]);

  const handleNewChatClick = () => {
    scrollAreaRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setOpenMenuTurnId(null);
    setConfirmDeleteTurnId(null);
    setEditingTurnId(null);
    onNewChat();
  };

  const startRename = (turn: SidebarTurn) => {
    const currentLabel = customTitles[turn.turn_id] || turn.prompt;
    renameCancelledRef.current = false;
    setEditingTurnId(turn.turn_id);
    setEditingValue(currentLabel);
    setRenameError(null);
    setOpenMenuTurnId(null);
    setConfirmDeleteTurnId(null);
  };

  const saveRename = (turnId: string) => {
    if (renameCancelledRef.current) return;
    const nextValue = editingValue.trim();
    const issue = validateSidebarTurnTitle(nextValue);
    if (issue) {
      setRenameError(sidebarTurnTitleIssueMessage(issue));
      editInputRef.current?.focus();
      return;
    }
    setCustomTitles((prev) => saveSidebarTurnTitle(turnId, nextValue, prev));
    setEditingTurnId(null);
    setEditingValue('');
    setRenameError(null);
  };

  const cancelRename = () => {
    renameCancelledRef.current = true;
    setEditingTurnId(null);
    setEditingValue('');
    setRenameError(null);
  };

  const deleteTurn = (turnId: string) => {
    setDeletedTurnIds((prev) => new Set(prev).add(turnId));
    setOpenMenuTurnId(null);
    setConfirmDeleteTurnId(null);
    if (activeTurnId === turnId) {
      onNewChat();
    }
  };

  return (
    <>
      <div
        className={`sidebar-overlay${isOpen ? ' visible' : ''}`}
        onClick={onClose}
      />
      <div
        className={`sidebar fixed left-0 z-40
                    transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${isOpen ? 'translate-x-0 open' : '-translate-x-full'}`}
        style={{
          top: '52px',
          height: 'calc(100% - 52px)',
          width: '260px',
          maxWidth: '88vw',
          background: '#F5F2EE',
          borderRight: '0.5px solid #E0D8D0',
        }}
      >
        <div className="flex flex-col h-full px-4 py-6">
          <div className="mb-2">
            <Button type="button" variant="primary" size="sm" fullWidth icon={Icons.plus(14)} onClick={handleNewChatClick}>
              New task
            </Button>
          </div>
          <div className="mb-5" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <MenuAction
              icon={<Trophy style={{ width: '14px', height: '14px', color: '#C4956A' }} />}
              label="Leaderboard"
              onClick={() => {
                void track('leaderboard_viewed');
                onLeaderboardClick();
              }}
            />
            <MenuAction
              icon={<Sparkles style={{ width: '14px', height: '14px', color: '#9B8FAA' }} />}
              label="Agent Mode"
              onClick={() => {
                void track('agent_nav_from_sidebar');
                onClose();
                navigate('/agent');
              }}
            />
            <MenuAction
              icon={<Bookmark style={{ width: '14px', height: '14px', color: '#8C7355' }} />}
              label="Watchlist"
              onClick={() => {
                void track('watchlist_nav_from_sidebar');
                onClose();
                navigate('/agent/watchlist');
              }}
            />
            <MenuAction
              icon={<LayoutGrid style={{ width: '14px', height: '14px', color: '#9B8FAA' }} />}
              label="Personas"
              onClick={() => {
                onClose();
                navigate('/personas');
              }}
            />
            {!isDefaultPanel && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#C4956A', flexShrink: 0 }} />
                <span style={{ color: '#C4956A' }}>Custom panel active</span>
                <button
                  type="button"
                  onClick={resetPanel}
                  style={{
                    color: '#6B6460',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '11px',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1A1714';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#6B6460';
                  }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          <div style={{ margin: '1.2rem 0 0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#6B6460', margin: 0 }}>Recents</p>
              {reversedTurns.length > 0 ? (
                <span style={{ fontSize: 10, color: '#A89070' }}>
                  {filteredTurns.length}
                  {searchQuery.trim() ||
                  activeFilter !== 'all' ||
                  recentsWinnerFilter !== SIDEBAR_RECENTS_WINNER_ALL ||
                  recentsRecencyFilter !== 'all'
                    ? ` / ${reversedTurns.length}`
                    : ''}
                </span>
              ) : null}
            </div>
            {reversedTurns.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  title="Copy recents as markdown"
                  aria-label={
                    copyRecentsStatus === 'copied'
                      ? 'Recents copied'
                      : copyRecentsStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy recents as markdown'
                  }
                  onClick={() => void handleCopyRecents()}
                  style={{
                    background: 'none',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color:
                      copyRecentsStatus === 'failed'
                        ? '#D85A30'
                        : copyRecentsStatus === 'copied'
                          ? '#5A8C6A'
                          : '#C4956A',
                    padding: '3px 8px',
                    fontSize: 10,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {copyRecentsStatus === 'copied'
                    ? 'Copied'
                    : copyRecentsStatus === 'failed'
                      ? 'Failed'
                      : 'Copy'}
                </button>
                <button
                  type="button"
                  title="Download recents as markdown"
                  aria-label={
                    downloadRecentsStatus === 'done'
                      ? 'Recents downloaded'
                      : downloadRecentsStatus === 'failed'
                        ? 'Download failed'
                        : 'Download recents as markdown'
                  }
                  onClick={() => handleDownloadRecents()}
                  style={{
                    background: 'none',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color:
                      downloadRecentsStatus === 'failed'
                        ? '#D85A30'
                        : downloadRecentsStatus === 'done'
                          ? '#5A8C6A'
                          : '#C4956A',
                    padding: '3px 8px',
                    fontSize: 10,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {downloadRecentsStatus === 'done'
                    ? 'Downloaded'
                    : downloadRecentsStatus === 'failed'
                      ? 'Failed'
                      : 'Download'}
                </button>
              </div>
            ) : null}
          </div>
          {copyRecentsStatus !== 'idle' || downloadRecentsStatus !== 'idle' ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                padding: 0,
                margin: -1,
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
              }}
            >
              {copyRecentsStatus === 'copied'
                ? 'Arena recents copied to clipboard'
                : copyRecentsStatus === 'failed'
                  ? 'Could not copy Arena recents'
                  : downloadRecentsStatus === 'done'
                    ? 'Arena recents downloaded'
                    : downloadRecentsStatus === 'failed'
                      ? 'Could not download Arena recents'
                      : ''}
            </div>
          ) : null}
          <div className="flex items-center gap-2 mb-2">
            {FILTERS.map((filter) => {
              const isActive = activeFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-label={filter.label}
                  title={filter.label}
                  onClick={() => setActiveFilter(filter.value)}
                  className="flex items-center justify-center"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: isActive ? '#C4956A' : '#F0EBE3',
                    color: isActive ? '#FFFFFF' : '#6B6460',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#E0D8D0';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#F0EBE3';
                  }}
                >
                  {filter.icon}
                </button>
              );
            })}
          </div>
          {reversedTurns.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              {recentsWinnerOptions.length > 2 ? (
                <div
                  role="group"
                  aria-label="Filter recents by winner"
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  {recentsWinnerOptions.map((opt) => {
                    const selected = recentsWinnerFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRecentsWinnerFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          background: selected ? '#F0E6DA' : 'transparent',
                          border: selected
                            ? '0.5px solid #C4956A'
                            : '0.5px solid #E0D8D0',
                          borderRadius: 999,
                          padding: '3px 9px',
                          fontSize: 10,
                          letterSpacing: '0.03em',
                          color: selected ? '#4A3728' : '#A89070',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                          lineHeight: 1.35,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {recentsRecencyFilterUseful ? (
                <div
                  role="group"
                  aria-label="Filter recents by recency"
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  {AGENT_HISTORY_RECENCY_OPTIONS.map((opt) => {
                    const selected = recentsRecencyFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRecentsRecencyFilter(opt.value)}
                        aria-pressed={selected}
                        style={{
                          background: selected ? '#F0E6DA' : 'transparent',
                          border: selected
                            ? '0.5px solid #C4956A'
                            : '0.5px solid #E0D8D0',
                          borderRadius: 999,
                          padding: '3px 9px',
                          fontSize: 10,
                          letterSpacing: '0.03em',
                          color: selected ? '#4A3728' : '#A89070',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                          lineHeight: 1.35,
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div style={{ marginBottom: 8 }}>
                <select
                  value={recentsSort}
                  onChange={(e) => setRecentsSort(e.target.value as SidebarRecentsSort)}
                  aria-label="Sort recents"
                  title="Sort recents"
                  style={{
                    width: '100%',
                    fontSize: 11,
                    fontFamily: 'Georgia, serif',
                    color: '#4A3728',
                    background: '#FAF7F4',
                    border: '0.5px solid #E0D8D0',
                    borderRadius: 6,
                    padding: '5px 8px',
                    cursor: 'pointer',
                  }}
                >
                  {SIDEBAR_RECENTS_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ position: 'relative' }}>
              <input
                id="sidebar-recents-search"
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recents…"
                aria-label="Search recents"
                autoComplete="off"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 12,
                  fontFamily: 'Georgia, serif',
                  color: '#1A1714',
                  background: '#FAF7F4',
                  border: '0.5px solid #E0D8D0',
                  borderRadius: 8,
                  padding: '7px 28px 7px 10px',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(196,149,106,0.55)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#E0D8D0';
                }}
              />
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: '#A89070',
                    lineHeight: 1,
                    padding: 4,
                  }}
                >
                  ×
                </button>
              ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto pr-1 pb-4" ref={scrollAreaRef}>
            {filteredTurns.length > 0 ? (
              <div className="space-y-1">
                {filteredTurns.map((turn) => {
                  const isActive = turn.turn_id === activeTurnId;
                  const winner = AGENTS[turn.winner_id];
                  const isMenuOpen = openMenuTurnId === turn.turn_id;
                  const isConfirmingDelete = confirmDeleteTurnId === turn.turn_id;
                  const isEditing = editingTurnId === turn.turn_id;
                  const displayTitle = customTitles[turn.turn_id] || turn.prompt;

                  return (
                    <div
                      key={turn.turn_id}
                      style={{
                        position: 'relative',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        background: isActive ? '#F0EBE3' : 'transparent',
                        borderLeft: isActive ? '2px solid #C4956A' : '2px solid transparent',
                        transition: 'all 150ms ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = '#F0EBE3';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                value={editingValue}
                                maxLength={SIDEBAR_TURN_TITLE_MAX + 20}
                                aria-invalid={Boolean(renameError)}
                                aria-describedby={
                                  renameError ? `sidebar-rename-error-${turn.turn_id}` : undefined
                                }
                                aria-label="Rename conversation"
                                onChange={(e) => {
                                  setEditingValue(e.target.value);
                                  if (renameError) setRenameError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveRename(turn.turn_id);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                onBlur={() => {
                                  if (!renameCancelledRef.current) {
                                    saveRename(turn.turn_id);
                                  }
                                }}
                                className="w-full bg-white border border-border rounded-md px-2 py-1 text-[13px] text-text-primary outline-none"
                                style={{
                                  borderColor: renameError ? '#D85A30' : undefined,
                                }}
                              />
                              {renameError && editingTurnId === turn.turn_id ? (
                                <p
                                  id={`sidebar-rename-error-${turn.turn_id}`}
                                  role="alert"
                                  style={{
                                    margin: '4px 0 0',
                                    fontSize: 11,
                                    color: '#D85A30',
                                    lineHeight: 1.35,
                                  }}
                                >
                                  {renameError}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onTurnClick(turn.turn_id)}
                              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              <p style={{ fontSize: '13px', color: '#1A1714', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.35' }}>
                                <HighlightQuery text={displayTitle} query={searchQuery} />
                              </p>
                              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AgentDot agentId={turn.winner_id} size={5} />
                                <span style={{ fontSize: '11px', color: '#6B6460', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{winner.name}</span>
                                <span style={{ fontSize: 11, color: '#A89070', marginLeft: 'auto', flexShrink: 0 }}>
                                  {formatRelativePast(turn.timestamp, { localeAfterDays: 7 })}
                                </span>
                              </div>
                            </button>
                          )}
                        </div>

                        <div className="relative shrink-0" ref={isMenuOpen || isConfirmingDelete ? menuLayerRef : undefined}>
                          <button
                            type="button"
                            aria-label="History item actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTurnId(null);
                              setEditingValue('');
                              setConfirmDeleteTurnId(null);
                              setOpenMenuTurnId((prev) => (prev === turn.turn_id ? null : turn.turn_id));
                            }}
                            className="flex items-center justify-center"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: isMenuOpen ? '#F0EBE3' : 'transparent',
                              color: '#6B6460',
                              transition: 'all 150ms ease',
                            }}
                          >
                            <Ellipsis className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div
                              className="absolute right-0 mt-2"
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E0D8D0',
                                borderRadius: '10px',
                                boxShadow: '0 4px 16px rgba(26,23,20,0.08)',
                                padding: '4px',
                                minWidth: '140px',
                                zIndex: 120,
                              }}
                            >
                              <MenuItem
                                icon={<Pencil className="w-[14px] h-[14px]" />}
                                label="Rename"
                                color="#1A1714"
                                hoverBackground="#F0EBE3"
                                onClick={() => startRename(turn)}
                              />
                              <MenuItem
                                icon={<Trash2 className="w-[14px] h-[14px]" />}
                                label="Delete"
                                color="#C0392B"
                                hoverBackground="#FEF2F2"
                                onClick={() => {
                                  setOpenMenuTurnId(null);
                                  setConfirmDeleteTurnId(turn.turn_id);
                                }}
                              />
                            </div>
                          )}

                          {isConfirmingDelete && (
                            <div
                              className="absolute right-0 mt-2"
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E0D8D0',
                                borderRadius: '10px',
                                boxShadow: '0 4px 16px rgba(26,23,20,0.08)',
                                padding: '10px',
                                minWidth: '160px',
                                zIndex: 120,
                              }}
                            >
                              <p className="text-[13px]" style={{ color: '#1A1714', marginBottom: '10px' }}>
                                Delete this prompt?
                              </p>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTurnId(null)}
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    color: '#6B6460',
                                    background: '#F0EBE3',
                                    transition: 'all 150ms ease',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTurn(turn.turn_id)}
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    color: '#FFFFFF',
                                    background: '#C0392B',
                                    transition: 'all 150ms ease',
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : reversedTurns.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#6B6460' }}>
                  Your history will appear here.
                </p>
              </div>
            ) : searchQuery.trim() ||
              recentsWinnerFilter !== SIDEBAR_RECENTS_WINNER_ALL ||
              recentsRecencyFilter !== 'all' ? (
              <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#6B6460', margin: '0 0 8px' }}>
                  {searchQuery.trim()
                    ? `No recents match “${searchQuery.trim()}”${
                        recentsWinnerFilter !== SIDEBAR_RECENTS_WINNER_ALL
                          ? ` from ${sidebarRecentsWinnerFilterLabel(recentsWinnerFilter, recentsWinnerOptions)}`
                          : ''
                      }${
                        recentsRecencyFilter !== 'all'
                          ? ` · ${agentHistoryRecencyLabel(recentsRecencyFilter)}`
                          : ''
                      }`
                    : recentsRecencyFilter !== 'all' &&
                        recentsWinnerFilter === SIDEBAR_RECENTS_WINNER_ALL
                      ? `No recents from ${agentHistoryRecencyLabel(recentsRecencyFilter).toLowerCase()}`
                      : `No recents from ${sidebarRecentsWinnerFilterLabel(recentsWinnerFilter, recentsWinnerOptions)}`}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setRecentsWinnerFilter(SIDEBAR_RECENTS_WINNER_ALL);
                    setRecentsRecencyFilter('all');
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    fontSize: 12,
                    color: '#C4956A',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Georgia, serif',
                    textDecoration: 'underline',
                  }}
                >
                  {(recentsWinnerFilter !== SIDEBAR_RECENTS_WINNER_ALL ||
                    recentsRecencyFilter !== 'all') &&
                  !searchQuery.trim()
                    ? 'Show all recents'
                    : 'Clear filters'}
                </button>
              </div>
            ) : (
              <div style={{ padding: '2rem 0', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: '#6B6460', textTransform: 'capitalize' }}>
                  No {activeFilter} prompts yet
                </p>
              </div>
            )}

            {savedItems.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div
                  style={{
                    margin: '1.2rem 0 0.6rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        color: '#6B6460',
                        margin: 0,
                      }}
                    >
                      Saved
                    </p>
                    <span style={{ fontSize: 10, color: '#A89070' }}>
                      {filteredSaved.length}
                      {savedSearchQuery.trim() ||
                      savedMindFilter !== SIDEBAR_SAVED_MIND_ALL ||
                      savedScoreFilter !== 'all' ||
                      savedRecencyFilter !== 'all'
                        ? ` / ${savedItems.length}`
                        : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      title="Copy all saved takes as markdown"
                      aria-label={
                        copyAllSavedStatus === 'copied'
                          ? 'Saved takes copied'
                          : copyAllSavedStatus === 'failed'
                            ? 'Copy failed'
                            : 'Copy all saved takes as markdown'
                      }
                      onClick={() => void handleCopyAllSaved()}
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color:
                          copyAllSavedStatus === 'failed'
                            ? '#D85A30'
                            : copyAllSavedStatus === 'copied'
                              ? '#5A8C6A'
                              : '#C4956A',
                        padding: '3px 8px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {copyAllSavedStatus === 'copied'
                        ? 'Copied'
                        : copyAllSavedStatus === 'failed'
                          ? 'Failed'
                          : 'Copy all'}
                    </button>
                    <button
                      type="button"
                      title="Download all saved takes as markdown"
                      aria-label={
                        downloadAllSavedStatus === 'done'
                          ? 'Saved takes downloaded'
                          : downloadAllSavedStatus === 'failed'
                            ? 'Download failed'
                            : 'Download all saved takes as markdown'
                      }
                      onClick={() => handleDownloadAllSaved()}
                      style={{
                        background: 'none',
                        border: '0.5px solid #E0D8D0',
                        borderRadius: 6,
                        cursor: 'pointer',
                        color:
                          downloadAllSavedStatus === 'failed'
                            ? '#D85A30'
                            : downloadAllSavedStatus === 'done'
                              ? '#5A8C6A'
                              : '#C4956A',
                        padding: '3px 8px',
                        fontSize: 10,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {downloadAllSavedStatus === 'done'
                        ? 'Downloaded'
                        : downloadAllSavedStatus === 'failed'
                          ? 'Failed'
                          : 'Download'}
                    </button>
                  </div>
                </div>
                {copyAllSavedStatus !== 'idle' || downloadAllSavedStatus !== 'idle' ? (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      position: 'absolute',
                      width: 1,
                      height: 1,
                      padding: 0,
                      margin: -1,
                      overflow: 'hidden',
                      clip: 'rect(0, 0, 0, 0)',
                      whiteSpace: 'nowrap',
                      border: 0,
                    }}
                  >
                    {copyAllSavedStatus === 'copied'
                      ? 'Saved takes copied to clipboard'
                      : copyAllSavedStatus === 'failed'
                        ? 'Could not copy saved takes'
                        : downloadAllSavedStatus === 'done'
                          ? 'Saved takes downloaded'
                          : downloadAllSavedStatus === 'failed'
                            ? 'Could not download saved takes'
                            : ''}
                  </div>
                ) : null}
                <div style={{ marginBottom: 8 }}>
                  {savedMindOptions.length > 2 ? (
                    <div
                      role="group"
                      aria-label="Filter saved takes by mind"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {savedMindOptions.map((opt) => {
                        const selected = savedMindFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSavedMindFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              background: selected ? '#F0E6DA' : 'transparent',
                              border: selected
                                ? '0.5px solid #C4956A'
                                : '0.5px solid #E0D8D0',
                              borderRadius: 999,
                              padding: '3px 9px',
                              fontSize: 10,
                              letterSpacing: '0.03em',
                              color: selected ? '#4A3728' : '#A89070',
                              cursor: 'pointer',
                              fontFamily: 'Georgia, serif',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {savedScoreFilterUseful ? (
                    <div
                      role="group"
                      aria-label="Filter saved takes by score"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {AGENT_HISTORY_SCORE_OPTIONS.map((opt) => {
                        const selected = savedScoreFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSavedScoreFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              background: selected ? '#F0E6DA' : 'transparent',
                              border: selected
                                ? '0.5px solid #C4956A'
                                : '0.5px solid #E0D8D0',
                              borderRadius: 999,
                              padding: '3px 9px',
                              fontSize: 10,
                              letterSpacing: '0.03em',
                              color: selected ? '#4A3728' : '#A89070',
                              cursor: 'pointer',
                              fontFamily: 'Georgia, serif',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  {savedRecencyFilterUseful ? (
                    <div
                      role="group"
                      aria-label="Filter saved takes by recency"
                      style={{
                        display: 'flex',
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {AGENT_HISTORY_RECENCY_OPTIONS.map((opt) => {
                        const selected = savedRecencyFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSavedRecencyFilter(opt.value)}
                            aria-pressed={selected}
                            style={{
                              background: selected ? '#F0E6DA' : 'transparent',
                              border: selected
                                ? '0.5px solid #C4956A'
                                : '0.5px solid #E0D8D0',
                              borderRadius: 999,
                              padding: '3px 9px',
                              fontSize: 10,
                              letterSpacing: '0.03em',
                              color: selected ? '#4A3728' : '#A89070',
                              cursor: 'pointer',
                              fontFamily: 'Georgia, serif',
                              lineHeight: 1.35,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <select
                    value={savedSort}
                    onChange={(e) => setSavedSort(e.target.value as SidebarSavedSort)}
                    aria-label="Sort saved takes"
                    title="Sort saved takes"
                    style={{
                      width: '100%',
                      fontSize: 11,
                      fontFamily: 'Georgia, serif',
                      color: '#4A3728',
                      background: '#FAF7F4',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 6,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}
                  >
                    {SIDEBAR_SAVED_SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div style={{ position: 'relative' }}>
                  <input
                    ref={savedSearchInputRef}
                    type="search"
                    value={savedSearchQuery}
                    onChange={(e) => setSavedSearchQuery(e.target.value)}
                    placeholder="Search saved…"
                    aria-label="Search saved takes"
                    autoComplete="off"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: 12,
                      fontFamily: 'Georgia, serif',
                      color: '#1A1714',
                      background: '#FAF7F4',
                      border: '0.5px solid #E0D8D0',
                      borderRadius: 8,
                      padding: '7px 28px 7px 10px',
                      outline: 'none',
                    }}
                  />
                  {savedSearchQuery ? (
                    <button
                      type="button"
                      aria-label="Clear saved search"
                      onClick={() => {
                        setSavedSearchQuery('');
                        savedSearchInputRef.current?.focus();
                      }}
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#A89070',
                        lineHeight: 1,
                        padding: 4,
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredSaved.length === 0 ? (
                    <div style={{ padding: '0.75rem 0.25rem', textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#6B6460', margin: '0 0 6px' }}>
                        {savedSearchQuery.trim()
                          ? `No saved takes match “${savedSearchQuery.trim()}”${
                              savedMindFilter !== SIDEBAR_SAVED_MIND_ALL
                                ? ` from ${sidebarSavedMindFilterLabel(savedMindFilter, savedMindOptions)}`
                                : ''
                            }${
                              savedScoreFilter !== 'all'
                                ? ` · ${agentHistoryScoreLabel(savedScoreFilter)}`
                                : ''
                            }${
                              savedRecencyFilter !== 'all'
                                ? ` · ${agentHistoryRecencyLabel(savedRecencyFilter)}`
                                : ''
                            }`
                          : savedRecencyFilter !== 'all' &&
                              savedMindFilter === SIDEBAR_SAVED_MIND_ALL &&
                              savedScoreFilter === 'all'
                            ? `No saved takes from ${agentHistoryRecencyLabel(savedRecencyFilter).toLowerCase()}`
                            : savedScoreFilter !== 'all' &&
                                savedMindFilter === SIDEBAR_SAVED_MIND_ALL
                              ? `No saved takes with score ${agentHistoryScoreLabel(savedScoreFilter)}`
                              : savedMindFilter !== SIDEBAR_SAVED_MIND_ALL
                                ? `No saved takes from ${sidebarSavedMindFilterLabel(savedMindFilter, savedMindOptions)}`
                                : 'No saved takes in this view'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSavedSearchQuery('');
                          setSavedMindFilter(SIDEBAR_SAVED_MIND_ALL);
                          setSavedScoreFilter('all');
                          setSavedRecencyFilter('all');
                          savedSearchInputRef.current?.focus();
                        }}
                        style={{
                          fontSize: 12,
                          color: '#C4956A',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'Georgia, serif',
                          textDecoration: 'underline',
                        }}
                      >
                        {(savedMindFilter !== SIDEBAR_SAVED_MIND_ALL ||
                          savedScoreFilter !== 'all' ||
                          savedRecencyFilter !== 'all') &&
                        !savedSearchQuery.trim()
                          ? 'Show all saved'
                          : 'Clear filters'}
                      </button>
                    </div>
                  ) : (
                    filteredSaved.map((item) => {
                      const agent = AGENTS[item.agent_id];
                      const displayName =
                        item.persona_name || agent?.name || item.agent_id || 'Mind';
                      const line = (item.one_liner || '').trim();
                      const justCopied = copiedSavedId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            width: '100%',
                            borderRadius: '10px',
                            padding: '8px 10px',
                            transition: 'background 150ms ease',
                            background: 'transparent',
                            display: 'flex',
                            alignItems: 'start',
                            gap: '6px',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#F0EBE3')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <button
                            type="button"
                            onClick={() => onSavedItemClick(item)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: 'left',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <AgentDot agentId={item.agent_id} size={5} />
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  color: '#1A1714',
                                }}
                              >
                                <HighlightQuery text={displayName} query={savedSearchQuery} />
                              </span>
                              <Bookmark
                                style={{
                                  width: '11px',
                                  height: '11px',
                                  flexShrink: 0,
                                  color: '#C4956A',
                                  fill: 'currentColor',
                                  marginLeft: 2,
                                }}
                              />
                            </div>
                            <p
                              style={{
                                marginTop: '4px',
                                fontSize: '11px',
                                lineHeight: '1.6',
                                color: '#6B6460',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <HighlightQuery
                                text={`${line.slice(0, 40)}${line.length > 40 ? '…' : ''}`}
                                query={savedSearchQuery}
                              />
                            </p>
                            {item.timestamp ? (
                              <p
                                style={{
                                  margin: '3px 0 0',
                                  fontSize: 10,
                                  color: '#A89070',
                                  lineHeight: 1.3,
                                }}
                                title={
                                  item.timestamp
                                    ? new Date(item.timestamp).toLocaleString()
                                    : undefined
                                }
                              >
                                {formatRelativePast(item.timestamp, { localeAfterDays: 7 })}
                              </p>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            aria-label={justCopied ? 'Copied' : `Copy ${displayName} take as markdown`}
                            title={justCopied ? 'Copied' : 'Copy as markdown'}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCopySaved(item, displayName);
                            }}
                            style={{
                              flexShrink: 0,
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: 'none',
                              background: justCopied ? 'rgba(196,149,106,0.15)' : 'transparent',
                              color: justCopied ? '#C4956A' : '#A89070',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                            }}
                          >
                            {justCopied ? (
                              <Check style={{ width: 13, height: 13 }} />
                            ) : (
                              <Copy style={{ width: 13, height: 13 }} />
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
                {copySavedFailed ? (
                  <p
                    role="alert"
                    style={{
                      fontSize: 11,
                      color: '#993C1D',
                      margin: '8px 0 0',
                      lineHeight: 1.4,
                    }}
                  >
                    Could not copy — try again.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {tier !== 'GUEST' && (
            <div
              style={{
                padding: '12px',
                borderTop: '0.5px solid #E0D8D0',
                marginTop: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#6B6460' }}>Messages today</span>
                <span style={{ fontSize: '11px', color: '#6B6460' }}>{messagesRemaining} left</span>
              </div>
              <div style={{ height: '3px', background: '#E0D8D0', borderRadius: '999px', margin: '6px 0' }}>
                <div
                  style={{
                    width: `${usedPercent}%`,
                    height: '100%',
                    background: usageColor,
                    borderRadius: '999px',
                    transition: 'width 300ms ease',
                  }}
                />
              </div>
              {messagesRemaining === 0 && (
                <>
                  <div style={{ fontSize: '11px', color: '#6B6460', marginBottom: '6px' }}>
                    You've used all messages today
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/pricing')}
                    style={{
                      fontSize: '11px',
                      color: '#C4956A',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Upgrade for more →
                  </button>
                </>
              )}
              {isFree && (
                <div style={{ fontSize: '10px', color: '#6B6460', letterSpacing: '.06em', marginTop: '4px' }}>
                  Free plan · resets daily
                </div>
              )}
            </div>
          )}

          {user ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                openModal('bottom-left');
              }}
              style={{
                padding: '12px 16px',
                borderTop: '0.5px solid #E0D5C5',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                transition: 'background 0.15s',
                background: 'transparent',
                border: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                width: '100%',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#EDE4D8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#C4956A',
                  color: '#FAF7F2',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {(() => {
                  const n = (user.name || '').trim();
                  if (n) {
                    const parts = n.split(/\s+/).filter(Boolean);
                    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                    return n.slice(0, 2).toUpperCase();
                  }
                  return (user.email.split('@')[0] || 'A').slice(0, 2).toUpperCase();
                })()}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: '#4A3728',
                  fontFamily: 'Georgia, serif',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(user.name || '').trim() || user.email.split('@')[0]}
              </span>
            </button>
          ) : null}

        </div>
      </div>

    </>
  );
}

interface MenuActionProps {
  icon: ReactNode;
  label: string;
  isPrimary?: boolean;
  onClick?: () => void;
}

function MenuAction({ icon, label, isPrimary = false, onClick }: MenuActionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        width: '100%',
        background: isPrimary ? '#1A1714' : '#F0EBE3',
        color: isPrimary ? '#FAF7F4' : '#1A1714',
        borderRadius: '999px',
        padding: '8px 16px',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: isPrimary ? 'none' : '0.5px solid #E0D8D0',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        opacity: isHovered ? (isPrimary ? 0.85 : 1) : 1,
      }}
      onMouseOver={(e) => {
        if (!isPrimary) e.currentTarget.style.background = '#E0D8D0';
      }}
      onMouseOut={(e) => {
        if (!isPrimary) e.currentTarget.style.background = '#F0EBE3';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}>
        {icon}
      </span>
      <span style={{ fontWeight: 400 }}>
        {label}
      </span>
    </button>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  color: string;
  hoverBackground: string;
  onClick: () => void;
}

function MenuItem({ icon, label, color, hoverBackground, onClick }: MenuItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center gap-2"
      style={{
        padding: '8px 12px',
        fontSize: '13px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        color,
        background: isHovered ? hoverBackground : 'transparent',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
