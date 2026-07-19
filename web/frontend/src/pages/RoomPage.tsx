import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { addRoomTask, getAgentHistory, getRoom, getRoomSynthesis, joinRoom, removeRoomTask } from '../api';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { KeyboardShortcutsHelp } from '../components/KeyboardShortcutsHelp';
import { HighlightQuery } from '../components/HighlightQuery';
import { MotionButton } from '../components/MotionButton';
import { PerspectiveDriftPanel } from '../components/PerspectiveDriftPanel';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { getUserColor, getUserInitials } from '../utils/roomUtils';
import { copyToClipboard } from '../lib/clipboard';
import {
  applyAbsoluteDocumentTitle,
  applyDocumentTitle,
  titleForRoom,
} from '../lib/documentTitle';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import {
  formatRoomBoardExport,
  plainAnswerExcerpt,
  resolveRoomTaskAnswerBody,
  roomTaskAnswerExpandable,
} from '../lib/roomBoardExport';
import {
  ROOM_BOARD_SORT_OPTIONS,
  roomBoardSortLabel,
  sortRoomBoardTasks,
  type RoomBoardSort,
} from '../lib/roomBoardSort';
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
  AGENT_HISTORY_CONFIDENCE_OPTIONS,
  agentHistoryConfidenceFilterUseful,
  agentHistoryConfidenceLabel,
  filterAgentHistoryByConfidence,
  type AgentHistoryConfidenceFilter,
} from '../lib/agentHistoryConfidenceFilter';
import { formatHistoryConfidenceBadge } from '../lib/agentHistoryRow';
import { formatRoomSynthesisExport } from '../lib/roomSynthesisExport';
import {
  formatRoomBoardRelative,
  roomBoardTaskAnswerText,
  roomBoardTaskQuestionText,
  roomBoardTimeTitle,
  roomMemberOnline,
} from '../lib/roomBoardTask';
import {
  buildRoomInviteShareData,
  canUseNativeShare,
  invokeNativeShare,
} from '../lib/shareUrl';
import { filterBySearchQuery } from '../lib/sidebarSearch';
import { isBareSlashKey, shouldCaptureSlashFocus } from '../lib/slashFocus';
import { setRedirectIntent } from '../utils/redirectIntent';

function LayersIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getExcerpt(task: any): string {
  const answer = task.final_answer || '';
  if (!answer) return '';

  if (answer.trim().startsWith('{') || answer.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(answer);
      if (parsed.sentences && Array.isArray(parsed.sentences)) {
        return parsed.sentences.map((s: any) => s.text || '').join(' ').slice(0, 140) + '...';
      }
      if (parsed.text) {
        return parsed.text.slice(0, 140) + '...';
      }
      if (parsed.final_answer) {
        return parsed.final_answer.slice(0, 140) + '...';
      }
    } catch {
      // Not JSON — fall through
    }
  }

  return answer
    .replace(/#{1,3}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 140) + '...';
}

function getTaskTitle(task: any): string {
  return task.title || task.question || task.task_text || 'Untitled task';
}

export function RoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const [room, setRoom] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState<'members' | 'synthesis' | 'tasks'>('synthesis');
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTasks, setHistoryTasks] = useState<any[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [inviteToast, setInviteToast] = useState(false);
  const [inviteShareStatus, setInviteShareStatus] = useState<'idle' | 'shared' | 'failed'>('idle');
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [hoverTask, setHoverTask] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [synthesisRefreshing, setSynthesisRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [boardQuery, setBoardQuery] = useState('');
  const [boardSort, setBoardSort] = useState<RoomBoardSort>('newest');
  const [boardMemberFilter, setBoardMemberFilter] = useState<string>('all');
  const [boardScoreFilter, setBoardScoreFilter] =
    useState<AgentHistoryScoreFilter>('all');
  const [boardRecencyFilter, setBoardRecencyFilter] =
    useState<AgentHistoryRecencyFilter>('all');
  const [boardConfidenceFilter, setBoardConfidenceFilter] =
    useState<AgentHistoryConfidenceFilter>('all');
  /** Ticks every 60s so board relative clocks + member online stay honest. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [taskActionToast, setTaskActionToast] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [synthDownloadStatus, setSynthDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [boardCopyStatus, setBoardCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [boardDownloadStatus, setBoardDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const boardSearchRef = useRef<HTMLInputElement | null>(null);
  const pickerSearchRef = useRef<HTMLInputElement | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);
  const boardCopyTimerRef = useRef<number | null>(null);
  const synthDownloadTimerRef = useRef<number | null>(null);
  const boardDownloadTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!slug) return;
    const data = await getRoom(slug);
    setRoom(data);
  }, [slug]);

  const loadRoom = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await getRoom(slug);
      setRoom(data);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : 'Could not load room');
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  // Contextual tab title once the room name is known (DocumentTitle only knows the path).
  useEffect(() => {
    if (!slug) return;
    const path = `/room/${slug}`;
    if (room?.name) {
      applyAbsoluteDocumentTitle(titleForRoom(room.name));
      return () => applyDocumentTitle(path);
    }
    applyDocumentTitle(path);
    return () => applyDocumentTitle(path);
  }, [slug, room?.name]);

  useEffect(() => {
    if (!slug || !user || authLoading) return;
    void joinRoom(slug).catch(() => {
      /* ignore */
    });
  }, [slug, user, authLoading]);

  useEffect(() => {
    if (!slug) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(id);
  }, [slug, refresh]);

  const members: any[] = room?.members ?? [];
  const tasks: any[] = room?.tasks ?? [];
  const synthesis = room?.synthesis;

  const isMember = useMemo(() => {
    if (!user) return false;
    return members.some((m: any) => m.user_id === user.id);
  }, [user, members]);

  const taskIdsInRoom = useMemo(() => new Set(tasks.map((t: any) => t.task_id)), [tasks]);

  useEffect(() => {
    if (!showTaskPicker || !user) return;
    let cancelled = false;
    setHistoryLoading(true);
    void getAgentHistory(1, 200)
      .then((raw: unknown) => {
        const tasksList = (raw as { tasks?: any[] })?.tasks ?? [];
        if (!cancelled) {
          setHistoryTasks(tasksList.filter((t) => t.task_id && !taskIdsInRoom.has(t.task_id)));
        }
      })
      .catch(() => {
        if (!cancelled) setHistoryTasks([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showTaskPicker, user, taskIdsInRoom]);

  const closeTaskPicker = useCallback(() => {
    setShowTaskPicker(false);
    setPickerQuery('');
    setNewTaskText('');
  }, []);

  // Escape closes the task picker; lock body scroll while open; focus search.
  useEffect(() => {
    if (!showTaskPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTaskPicker();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusId = window.setTimeout(() => pickerSearchRef.current?.focus(), 50);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusId);
    };
  }, [showTaskPicker, closeTaskPicker]);

  // `/` focuses board search, or history search when the add-task picker is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isBareSlashKey(e) || !shouldCaptureSlashFocus(e.target)) return;
      e.preventDefault();
      if (showTaskPicker) {
        pickerSearchRef.current?.focus();
        pickerSearchRef.current?.select();
        return;
      }
      // Switch to tasks tab on mobile so the search field is visible.
      if (isMobile) setMobileTab('tasks');
      window.requestAnimationFrame(() => {
        boardSearchRef.current?.focus();
        boardSearchRef.current?.select();
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTaskPicker, isMobile]);

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      if (m?.user_id) map[m.user_id] = m.name || 'Member';
    }
    return map;
  }, [members]);

  const filteredBoardTasks = useMemo(() => {
    const byMember =
      boardMemberFilter === 'all'
        ? tasks
        : tasks.filter((t: any) => t.user_id === boardMemberFilter);
    const byScore = filterAgentHistoryByScore(
      byMember.map((t: any) => ({
        ...t,
        score: t.final_score ?? null,
      })),
      boardScoreFilter,
    );
    const byRecency = filterAgentHistoryByRecency(byScore, boardRecencyFilter);
    const byConfidence = filterAgentHistoryByConfidence(byRecency, boardConfidenceFilter);
    const filtered = filterBySearchQuery(byConfidence, boardQuery, (t) => [
      getTaskTitle(t),
      t.question,
      t.task_text,
      t.final_answer,
      memberNameById[t.user_id],
    ]);
    return sortRoomBoardTasks(
      filtered.map((t: any) => ({
        ...t,
        id: t.task_id,
        title: getTaskTitle(t),
        author: memberNameById[t.user_id] || '',
        score: t.final_score,
        createdAt: t.created_at,
      })),
      boardSort,
    );
  }, [
    tasks,
    boardQuery,
    memberNameById,
    boardSort,
    boardMemberFilter,
    boardScoreFilter,
    boardRecencyFilter,
    boardConfidenceFilter,
  ]);

  const boardScoreFilterUseful = useMemo(
    () =>
      agentHistoryScoreFilterUseful(
        tasks.map((t: any) => ({ score: t.final_score ?? null })),
      ),
    [tasks],
  );

  const boardRecencyFilterUseful = useMemo(
    () => agentHistoryRecencyFilterUseful(tasks),
    [tasks],
  );

  const boardConfidenceFilterUseful = useMemo(
    () =>
      agentHistoryConfidenceFilterUseful(
        tasks.map((t: any) => ({ final_confidence: t.final_confidence ?? null })),
      ),
    [tasks],
  );

  const filteredHistoryTasks = useMemo(
    () =>
      filterBySearchQuery(historyTasks, pickerQuery, (ht) => [
        ht.task_text,
        ht.title,
        ht.question,
      ]),
    [historyTasks, pickerQuery],
  );

  const contradictions: any[] = Array.isArray(synthesis?.contradictions) ? synthesis.contradictions : [];
  const patterns: string[] = Array.isArray(synthesis?.patterns) ? synthesis.patterns : [];
  const synthText = typeof synthesis?.synthesis === 'string' ? synthesis.synthesis : '';

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!taskActionToast) return;
    const t = window.setTimeout(() => setTaskActionToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [taskActionToast]);

  // Drop member filter when leaving the room or the filtered member is gone.
  useEffect(() => {
    setBoardMemberFilter('all');
    setBoardRecencyFilter('all');
    setBoardConfidenceFilter('all');
  }, [slug]);

  useEffect(() => {
    if (boardMemberFilter === 'all') return;
    if (!members.some((m: any) => m.user_id === boardMemberFilter)) {
      setBoardMemberFilter('all');
    }
  }, [members, boardMemberFilter]);

  const roomInviteUrl = () =>
    room?.share_url || `${window.location.origin}/room/${slug}`;

  const copyInvite = async () => {
    const url = roomInviteUrl();
    const ok = await copyToClipboard(url);
    if (ok) {
      setInviteToast(true);
      window.setTimeout(() => setInviteToast(false), 2000);
    } else {
      setActionError('Could not copy invite link — copy from the address bar instead.');
      window.setTimeout(() => setActionError(null), 3200);
    }
  };

  const shareInvite = async () => {
    if (!room) return;
    const url = roomInviteUrl();
    const data = buildRoomInviteShareData({
      roomName: room.name || 'Research room',
      shareUrl: url,
    });
    const result = await invokeNativeShare(data);
    if (result === 'shared') {
      setInviteShareStatus('shared');
      window.setTimeout(() => setInviteShareStatus('idle'), 2200);
      return;
    }
    if (result === 'cancelled') return;
    // Unavailable or failed — fall back to clipboard so invites still ship.
    const ok = await copyToClipboard(url);
    if (ok) {
      setInviteToast(true);
      window.setTimeout(() => setInviteToast(false), 2000);
    } else {
      setInviteShareStatus('failed');
      setActionError('Could not share invite — copy the link from the address bar instead.');
      window.setTimeout(() => {
        setInviteShareStatus('idle');
        setActionError(null);
      }, 3200);
    }
  };

  const flashCopyStatus = (status: 'copied' | 'failed') => {
    if (copyStatusTimerRef.current != null) {
      window.clearTimeout(copyStatusTimerRef.current);
    }
    setCopyStatus(status);
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      copyStatusTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const flashBoardCopyStatus = (status: 'copied' | 'failed') => {
    if (boardCopyTimerRef.current != null) {
      window.clearTimeout(boardCopyTimerRef.current);
    }
    setBoardCopyStatus(status);
    boardCopyTimerRef.current = window.setTimeout(() => {
      setBoardCopyStatus('idle');
      boardCopyTimerRef.current = null;
    }, status === 'copied' ? 2200 : 3200);
  };

  const flashSynthDownloadStatus = (status: 'done' | 'failed') => {
    if (synthDownloadTimerRef.current != null) {
      window.clearTimeout(synthDownloadTimerRef.current);
    }
    setSynthDownloadStatus(status);
    synthDownloadTimerRef.current = window.setTimeout(() => {
      setSynthDownloadStatus('idle');
      synthDownloadTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  const flashBoardDownloadStatus = (status: 'done' | 'failed') => {
    if (boardDownloadTimerRef.current != null) {
      window.clearTimeout(boardDownloadTimerRef.current);
    }
    setBoardDownloadStatus(status);
    boardDownloadTimerRef.current = window.setTimeout(() => {
      setBoardDownloadStatus('idle');
      boardDownloadTimerRef.current = null;
    }, status === 'done' ? 2200 : 3200);
  };

  useEffect(() => {
    return () => {
      if (copyStatusTimerRef.current != null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
      if (boardCopyTimerRef.current != null) {
        window.clearTimeout(boardCopyTimerRef.current);
      }
      if (synthDownloadTimerRef.current != null) {
        window.clearTimeout(synthDownloadTimerRef.current);
      }
      if (boardDownloadTimerRef.current != null) {
        window.clearTimeout(boardDownloadTimerRef.current);
      }
    };
  }, []);

  const buildSynthesisMarkdown = () => {
    if (!room) return '';
    return formatRoomSynthesisExport({
      roomName: room.name || 'Research room',
      shareUrl: room.share_url || `${window.location.origin}/room/${slug}`,
      memberCount: members.length,
      taskCount: tasks.length,
      synthesis: synthText,
      patterns,
      contradictions: contradictions.map((c: any) => ({
        member_a: c.member_a,
        member_b: c.member_b,
        claim_a: c.claim_a,
        claim_b: c.claim_b,
        resolution_hint: c.resolution_hint,
      })),
      tasks: tasks.map((t: any) => ({
        title: getTaskTitle(t),
        author: memberNameById[t.user_id] || undefined,
        score: t.final_score,
      })),
    });
  };

  const buildBoardMarkdown = () => {
    if (!room) return '';
    const bits: string[] = [];
    const q = boardQuery.trim();
    if (q) bits.push(`search “${q}”`);
    if (boardMemberFilter !== 'all') {
      const name = memberNameById[boardMemberFilter] || 'Member';
      bits.push(`member: ${name}`);
    }
    if (boardScoreFilter !== 'all') {
      bits.push(`score: ${agentHistoryScoreLabel(boardScoreFilter)}`);
    }
    if (boardRecencyFilter !== 'all') {
      bits.push(`recency: ${agentHistoryRecencyLabel(boardRecencyFilter)}`);
    }
    if (boardConfidenceFilter !== 'all') {
      bits.push(`confidence: ${agentHistoryConfidenceLabel(boardConfidenceFilter)}`);
    }
    if (boardSort !== 'newest') bits.push(`sort: ${roomBoardSortLabel(boardSort)}`);
    return formatRoomBoardExport({
      roomName: room.name || 'Research room',
      shareUrl: room.share_url || `${window.location.origin}/room/${slug}`,
      memberCount: members.length,
      totalTaskCount: tasks.length,
      filterNote: bits.length > 0 ? bits.join(' · ') : undefined,
      tasks: filteredBoardTasks.map((t: any) => ({
        title: getTaskTitle(t),
        author: memberNameById[t.user_id] || undefined,
        score: t.final_score,
        createdAt: t.created_at,
        excerpt: plainAnswerExcerpt(t.final_answer),
        question: t.question || t.task_text || undefined,
        taskId: t.task_id,
      })),
    });
  };

  const copyBoardTaskQuestion = async (task: any) => {
    const text = roomBoardTaskQuestionText(task);
    if (!text) {
      setTaskActionToast('No question to copy on this task.');
      return;
    }
    const ok = await copyToClipboard(text);
    setTaskActionToast(ok ? 'Question copied.' : 'Could not copy question — try again.');
  };

  const copyBoardTaskAnswer = async (task: any) => {
    const text = roomBoardTaskAnswerText(task);
    if (!text) {
      setTaskActionToast('No answer to copy on this task yet.');
      return;
    }
    const ok = await copyToClipboard(text);
    setTaskActionToast(ok ? 'Answer copied.' : 'Could not copy answer — try again.');
  };

  const copySynthesis = async () => {
    const markdown = buildSynthesisMarkdown();
    if (!markdown) return;
    const ok = await copyToClipboard(markdown);
    if (ok) {
      flashCopyStatus('copied');
    } else {
      flashCopyStatus('failed');
      setActionError('Could not copy synthesis — select the text and copy manually.');
      window.setTimeout(() => setActionError(null), 3200);
    }
  };

  const downloadSynthesis = () => {
    const markdown = buildSynthesisMarkdown();
    if (!markdown) return;
    const stem = `room-synthesis-${room?.name || slug || 'export'}`;
    const ok = downloadMarkdownFile(markdown, stem);
    if (ok) {
      flashSynthDownloadStatus('done');
    } else {
      flashSynthDownloadStatus('failed');
      setActionError('Could not download synthesis — try Copy instead.');
      window.setTimeout(() => setActionError(null), 3200);
    }
  };

  const copyBoard = async () => {
    const markdown = buildBoardMarkdown();
    if (!markdown) return;
    const ok = await copyToClipboard(markdown);
    if (ok) {
      flashBoardCopyStatus('copied');
    } else {
      flashBoardCopyStatus('failed');
      setActionError('Could not copy board — select the text and copy manually.');
      window.setTimeout(() => setActionError(null), 3200);
    }
  };

  const downloadBoard = () => {
    const markdown = buildBoardMarkdown();
    if (!markdown) return;
    const stem = `room-board-${room?.name || slug || 'export'}`;
    const ok = downloadMarkdownFile(markdown, stem);
    if (ok) {
      flashBoardDownloadStatus('done');
    } else {
      flashBoardDownloadStatus('failed');
      setActionError('Could not download board — try Copy board instead.');
      window.setTimeout(() => setActionError(null), 3200);
    }
  };

  const handleAddExisting = async (taskId: string) => {
    if (!slug) return;
    setActionError(null);
    try {
      const data = await addRoomTask(slug, taskId);
      setRoom(data);
      closeTaskPicker();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Could not add task to room');
    }
  };

  const handleRemoveTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!slug || !user || !room) return;
    const can =
      tasks.find((t: any) => t.task_id === taskId)?.user_id === user.id || room.creator_id === user.id;
    if (!can) return;
    setActionError(null);
    try {
      const data = await removeRoomTask(slug, taskId);
      setRoom(data);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove task');
    }
  };

  const handleRefreshSynthesis = async () => {
    if (!slug || synthesisRefreshing) return;
    setSynthesisRefreshing(true);
    setActionError(null);
    try {
      const s = await getRoomSynthesis(slug, true);
      setRoom((prev: any) => prev ? { ...prev, synthesis: s.synthesis, synthesis_updated_at: s.synthesis_updated_at } : prev);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not refresh synthesis');
    } finally {
      setSynthesisRefreshing(false);
    }
  };

  const handleResolveContradiction = (claimA: string, claimB: string) => {
    const question = `Compare and resolve: ${claimA} vs ${claimB} — which is more accurate and why?`;
    try {
      sessionStorage.setItem('arena_prefill_question', question);
    } catch { /* ignore */ }
    navigate('/agent');
  };

  const sidebarInner = (
    <>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C4A882', marginBottom: 10 }}>
        Members
      </div>
      {members.map((m: any) => {
        const selected = boardMemberFilter === m.user_id;
        return (
          <button
            key={m.user_id}
            type="button"
            onClick={() => {
              setBoardMemberFilter((prev) => (prev === m.user_id ? 'all' : m.user_id));
              if (isMobile) setMobileTab('tasks');
            }}
            aria-pressed={selected}
            title={
              selected
                ? `Show all tasks (currently filtering by ${m.name || 'Member'})`
                : `Show only ${m.name || 'Member'}'s tasks`
            }
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 10,
              width: '100%',
              background: selected ? 'rgba(196,149,106,0.12)' : 'transparent',
              border: selected ? '0.5px solid #C4956A' : '0.5px solid transparent',
              borderRadius: 8,
              padding: '4px 6px',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: getUserColor(m.user_id),
                color: '#FAF7F2',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {getUserInitials(m.name || '')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#2C1810', fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 10, color: '#A89070' }}>{m.task_count ?? 0} tasks</div>
            </div>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: roomMemberOnline(m.last_seen_at, nowMs) ? '#639922' : '#D4C4B0',
                marginLeft: 'auto',
                flexShrink: 0,
              }}
            />
          </button>
        );
      })}
      {boardMemberFilter !== 'all' ? (
        <button
          type="button"
          onClick={() => setBoardMemberFilter('all')}
          style={{
            width: '100%',
            marginBottom: 10,
            background: 'none',
            border: 'none',
            color: '#C4956A',
            fontSize: 11,
            cursor: 'pointer',
            textAlign: 'left',
            padding: '0 6px',
            textDecoration: 'underline',
            fontFamily: 'Georgia, serif',
          }}
        >
          Show all members' tasks
        </button>
      ) : null}
      <div style={{ height: 0.5, background: '#EDE4D8', margin: '12px 0' }} />
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C4A882', marginBottom: 6 }}>
        Room topic
      </div>
      <div style={{ fontSize: 12, color: '#8C7355', fontStyle: 'italic', lineHeight: 1.5 }}>{room?.name}</div>
      <div style={{ height: 0.5, background: '#EDE4D8', margin: '12px 0' }} />
      {user && isMember ? (
        <button
          type="button"
          onClick={() => setShowTaskPicker(true)}
          style={{
            width: '100%',
            border: '0.5px dashed #D4C4B0',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#C4A882',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Add your task
        </button>
      ) : null}
    </>
  );

  const synthesisInner = (
    <div
      style={{
        background: '#FAF7F2',
        border: '0.5px solid #E0D5C5',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          background: '#2C1810',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C4956A' }}>
          <LayersIcon />
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Group synthesis</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {contradictions.length > 0 ? (
            <span
              style={{
                fontSize: 10,
                background: '#FCF0EE',
                color: '#993C1D',
                border: '0.5px solid #F0997B',
                borderRadius: 8,
                padding: '4px 10px',
              }}
            >
              {contradictions.length} contradictions
            </span>
          ) : null}
          {synthesis && tasks.length >= 2 ? (
            <>
              <button
                type="button"
                title="Copy synthesis as markdown"
                aria-label={
                  copyStatus === 'copied'
                    ? 'Synthesis copied'
                    : copyStatus === 'failed'
                      ? 'Copy failed'
                      : 'Copy synthesis as markdown'
                }
                onClick={() => void copySynthesis()}
                style={{
                  background: 'none',
                  border: '0.5px solid rgba(196,149,106,0.45)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color:
                    copyStatus === 'failed'
                      ? '#F0997B'
                      : copyStatus === 'copied'
                        ? '#5A8C6A'
                        : '#C4956A',
                  padding: '3px 8px',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy'}
              </button>
              <button
                type="button"
                title="Download synthesis as markdown"
                aria-label={
                  synthDownloadStatus === 'done'
                    ? 'Synthesis downloaded'
                    : synthDownloadStatus === 'failed'
                      ? 'Download failed'
                      : 'Download synthesis as markdown'
                }
                onClick={() => downloadSynthesis()}
                style={{
                  background: 'none',
                  border: '0.5px solid rgba(196,149,106,0.45)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color:
                    synthDownloadStatus === 'failed'
                      ? '#F0997B'
                      : synthDownloadStatus === 'done'
                        ? '#5A8C6A'
                        : '#C4956A',
                  padding: '3px 8px',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {synthDownloadStatus === 'done'
                  ? 'Downloaded'
                  : synthDownloadStatus === 'failed'
                    ? 'Failed'
                    : 'Download .md'}
              </button>
              <button
                type="button"
                title="Refresh synthesis"
                aria-label="Refresh synthesis"
                onClick={() => void handleRefreshSynthesis()}
                disabled={synthesisRefreshing}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: synthesisRefreshing ? 'default' : 'pointer',
                  color: '#C4956A',
                  padding: 4,
                  opacity: synthesisRefreshing ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden style={synthesisRefreshing ? { animation: 'spin 1s linear infinite' } : undefined}>
                  <path d="M21 2v6h-6M3 22v-6h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 12a9 9 0 0115.36-6.36L21 8M21 12a9 9 0 01-15.36 6.36L3 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
      </div>
      {!synthesis || tasks.length < 2 ? (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <svg width={32} height={32} viewBox="0 0 32 32" fill="none" aria-hidden style={{ margin: '0 auto 12px', display: 'block', color: '#D4C4B0' }}>
            <circle cx="12" cy="16" r="9" stroke="currentColor" strokeWidth={1.5} fill="none" />
            <circle cx="20" cy="16" r="9" stroke="currentColor" strokeWidth={1.5} fill="none" />
          </svg>
          <div style={{ fontSize: 14, color: '#A89070', fontStyle: 'italic' }}>
            Add 2 or more tasks to see group synthesis
          </div>
          <div style={{ fontSize: 12, color: '#C4A882', marginTop: 4 }}>
            Arena will automatically compare findings across all members
          </div>
        </div>
      ) : (
        <div>
          {contradictions.map((c: any, i: number) => (
            <div
              key={i}
              style={{
                background: '#FDF5F0',
                borderLeft: '3px solid #D85A30',
                borderRadius: 6,
                padding: '11px 14px',
                margin: '12px 12px 8px',
              }}
            >
              <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#D85A30', marginBottom: 6 }}>
                ⚠ {c.member_a} vs {c.member_b}
              </div>
              <div style={{ fontSize: 12, color: '#2C1810' }}>{c.claim_a}</div>
              <div style={{ fontSize: 10, color: '#A89070', fontStyle: 'italic', margin: '4px 0' }}>vs</div>
              <div style={{ fontSize: 12, color: '#2C1810' }}>{c.claim_b}</div>
              {c.resolution_hint ? (
                <div style={{ fontSize: 11, color: '#A89070', fontStyle: 'italic', marginTop: 5 }}>{c.resolution_hint}</div>
              ) : null}
              <button
                type="button"
                onClick={() => handleResolveContradiction(c.claim_a || '', c.claim_b || '')}
                style={{
                  marginTop: 8,
                  background: 'none',
                  border: '0.5px solid #D4C4B0',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 11,
                  color: '#C4956A',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                }}
              >
                Resolve this →
              </button>
            </div>
          ))}
          {patterns.length > 0 ? (
            <>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#A89070', margin: '12px 12px 6px' }}>
                Shared patterns across all tasks
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '0 12px 12px' }}>
                {patterns.map((p, j) => (
                  <span
                    key={j}
                    style={{
                      background: '#F0E8DC',
                      border: '0.5px solid #D4C4B0',
                      borderRadius: 10,
                      fontSize: 11,
                      color: '#4A3728',
                      padding: '3px 10px',
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </>
          ) : null}
          {synthText ? (
            <div
              style={{
                padding: '12px 14px 16px',
                borderTop: '0.5px solid #EDE4D8',
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#A89070',
                  marginBottom: 8,
                }}
              >
                Synthesis
              </div>
              <AgentAnswerMarkdown markdown={synthText} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  const tasksGrid =
    tasks.length === 0 ? (
      <div
        style={{
          background: '#FAF7F2',
          border: '0.5px solid #E0D5C5',
          borderRadius: 12,
          padding: '36px 24px',
          textAlign: 'center',
        }}
      >
        <svg
          width={40}
          height={40}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={{ margin: '0 auto 14px', display: 'block', color: '#D4C4B0' }}
        >
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth={1.5} />
        </svg>
        <p style={{ margin: 0, fontSize: 15, color: '#4A3728', fontWeight: 500, fontFamily: 'Georgia, serif' }}>
          No research tasks yet
        </p>
        <p
          style={{
            margin: '8px auto 0',
            maxWidth: 340,
            fontSize: 13,
            color: '#8C7355',
            lineHeight: 1.55,
          }}
        >
          {user && isMember
            ? 'Add completed Agent tasks to this room so the group can synthesize shared findings.'
            : user
              ? 'Join this room to contribute your Agent research to the board.'
              : 'Sign in to join this room and add your research tasks.'}
        </p>
        {user && isMember ? (
          <MotionButton
            type="button"
            variant="primary"
            size="md"
            style={{ marginTop: 18 }}
            onClick={() => setShowTaskPicker(true)}
          >
            Add your first task →
          </MotionButton>
        ) : !user ? (
          <MotionButton
            type="button"
            variant="primary"
            size="md"
            style={{ marginTop: 18 }}
            onClick={() => {
              setRedirectIntent(`/room/${slug}`);
              navigate('/signin');
            }}
          >
            Sign in to join →
          </MotionButton>
        ) : null}
      </div>
    ) : (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C4A882' }}>
          Research board
          <span style={{ marginLeft: 8, color: '#A89070', letterSpacing: 0, textTransform: 'none', fontSize: 11 }}>
            {filteredBoardTasks.length}
            {boardQuery.trim() ||
            boardMemberFilter !== 'all' ||
            boardScoreFilter !== 'all' ||
            boardRecencyFilter !== 'all' ||
            boardConfidenceFilter !== 'all'
              ? ` / ${tasks.length}`
              : ''}
            {boardMemberFilter !== 'all'
              ? ` · ${memberNameById[boardMemberFilter] || 'Member'}`
              : ''}
            {boardScoreFilter !== 'all'
              ? ` · ${agentHistoryScoreLabel(boardScoreFilter)}`
              : ''}
            {boardRecencyFilter !== 'all'
              ? ` · ${agentHistoryRecencyLabel(boardRecencyFilter)}`
              : ''}
            {boardConfidenceFilter !== 'all'
              ? ` · ${agentHistoryConfidenceLabel(boardConfidenceFilter)}`
              : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {tasks.length > 0 ? (
            <>
              <select
                value={boardSort}
                onChange={(e) => setBoardSort(e.target.value as RoomBoardSort)}
                aria-label="Sort research board"
                title="Sort research board"
                style={{
                  fontSize: 11,
                  fontFamily: 'Georgia, serif',
                  color: '#4A3728',
                  background: '#FAF7F2',
                  border: '0.5px solid #D4C4B0',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {ROOM_BOARD_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Copy board as markdown"
                aria-label={
                  boardCopyStatus === 'copied'
                    ? 'Board copied'
                    : boardCopyStatus === 'failed'
                      ? 'Copy failed'
                      : 'Copy board as markdown'
                }
                onClick={() => void copyBoard()}
                style={{
                  background: 'none',
                  border: '0.5px solid #D4C4B0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color:
                    boardCopyStatus === 'failed'
                      ? '#D85A30'
                      : boardCopyStatus === 'copied'
                        ? '#5A8C6A'
                        : '#C4956A',
                  padding: '4px 10px',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {boardCopyStatus === 'copied'
                  ? 'Copied'
                  : boardCopyStatus === 'failed'
                    ? 'Failed'
                    : 'Copy board'}
              </button>
              <button
                type="button"
                title="Download board as markdown"
                aria-label={
                  boardDownloadStatus === 'done'
                    ? 'Board downloaded'
                    : boardDownloadStatus === 'failed'
                      ? 'Download failed'
                      : 'Download board as markdown'
                }
                onClick={() => downloadBoard()}
                style={{
                  background: 'none',
                  border: '0.5px solid #D4C4B0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color:
                    boardDownloadStatus === 'failed'
                      ? '#D85A30'
                      : boardDownloadStatus === 'done'
                        ? '#5A8C6A'
                        : '#C4956A',
                  padding: '4px 10px',
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {boardDownloadStatus === 'done'
                  ? 'Downloaded'
                  : boardDownloadStatus === 'failed'
                    ? 'Failed'
                    : 'Download .md'}
              </button>
            </>
          ) : null}
          <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 280 }}>
            <input
              ref={boardSearchRef}
              type="search"
              value={boardQuery}
              onChange={(e) => setBoardQuery(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search room tasks"
              autoComplete="off"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: 12,
                fontFamily: 'Georgia, serif',
                color: '#2C1810',
                background: '#FAF7F2',
                border: '0.5px solid #E0D5C5',
                borderRadius: 8,
                padding: '7px 28px 7px 10px',
                outline: 'none',
              }}
            />
            {boardQuery ? (
              <button
                type="button"
                aria-label="Clear task search"
                onClick={() => {
                  setBoardQuery('');
                  boardSearchRef.current?.focus();
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
      </div>
      {members.length > 1 && tasks.length > 0 ? (
        <div
          role="group"
          aria-label="Filter board by member"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setBoardMemberFilter('all')}
            aria-pressed={boardMemberFilter === 'all'}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: boardMemberFilter === 'all' ? 'none' : '0.5px solid #D4C4B0',
              background: boardMemberFilter === 'all' ? '#C4956A' : 'transparent',
              color: boardMemberFilter === 'all' ? '#FAF7F2' : '#8C7355',
              fontSize: 11,
              fontFamily: 'Georgia, serif',
              cursor: 'pointer',
            }}
          >
            All members
          </button>
          {members.map((m: any) => {
            const selected = boardMemberFilter === m.user_id;
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() =>
                  setBoardMemberFilter((prev) => (prev === m.user_id ? 'all' : m.user_id))
                }
                aria-pressed={selected}
                title={`Show tasks from ${m.name || 'Member'}`}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: selected ? 'none' : '0.5px solid #D4C4B0',
                  background: selected ? getUserColor(m.user_id) : 'transparent',
                  color: selected ? '#FAF7F2' : '#8C7355',
                  fontSize: 11,
                  fontFamily: 'Georgia, serif',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: selected ? 'rgba(255,255,255,0.25)' : getUserColor(m.user_id),
                    color: '#FAF7F2',
                    fontSize: 8,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {getUserInitials(m.name || '')}
                </span>
                {m.name || 'Member'}
              </button>
            );
          })}
        </div>
      ) : null}
      {boardScoreFilterUseful ? (
        <div
          role="group"
          aria-label="Filter board by score"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          {AGENT_HISTORY_SCORE_OPTIONS.map((opt) => {
            const selected = boardScoreFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBoardScoreFilter(opt.value)}
                aria-pressed={selected}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                  background: selected ? '#F0E6DA' : 'transparent',
                  color: selected ? '#4A3728' : '#8C7355',
                  fontSize: 11,
                  fontFamily: 'Georgia, serif',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {boardRecencyFilterUseful ? (
        <div
          role="group"
          aria-label="Filter board by recency"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          {AGENT_HISTORY_RECENCY_OPTIONS.map((opt) => {
            const selected = boardRecencyFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBoardRecencyFilter(opt.value)}
                aria-pressed={selected}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                  background: selected ? '#F0E6DA' : 'transparent',
                  color: selected ? '#4A3728' : '#8C7355',
                  fontSize: 11,
                  fontFamily: 'Georgia, serif',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {boardConfidenceFilterUseful ? (
        <div
          role="group"
          aria-label="Filter board by confidence"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 12,
            alignItems: 'center',
          }}
        >
          {AGENT_HISTORY_CONFIDENCE_OPTIONS.map((opt) => {
            const selected = boardConfidenceFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBoardConfidenceFilter(opt.value)}
                aria-pressed={selected}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: selected ? '0.5px solid #C4956A' : '0.5px solid #D4C4B0',
                  background: selected ? '#F0E6DA' : 'transparent',
                  color: selected ? '#4A3728' : '#8C7355',
                  fontSize: 11,
                  fontFamily: 'Georgia, serif',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {taskActionToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 10,
            fontSize: 12,
            color: '#5A4A3A',
            fontFamily: 'Georgia, serif',
          }}
        >
          {taskActionToast}
        </div>
      ) : null}
      {boardCopyStatus !== 'idle' ? (
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
          {boardCopyStatus === 'copied'
            ? 'Research board copied to clipboard'
            : 'Could not copy research board'}
        </div>
      ) : null}
      {filteredBoardTasks.length === 0 ? (
        <div
          style={{
            background: '#FAF7F2',
            border: '0.5px solid #E0D5C5',
            borderRadius: 12,
            padding: '28px 20px',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#4A3728', fontWeight: 500 }}>
            {boardQuery.trim()
              ? `No tasks match “${boardQuery.trim()}”${
                  boardMemberFilter !== 'all'
                    ? ` from ${memberNameById[boardMemberFilter] || 'this member'}`
                    : ''
                }${
                  boardScoreFilter !== 'all'
                    ? ` · ${agentHistoryScoreLabel(boardScoreFilter)}`
                    : ''
                }${
                  boardRecencyFilter !== 'all'
                    ? ` · ${agentHistoryRecencyLabel(boardRecencyFilter)}`
                    : ''
                }${
                  boardConfidenceFilter !== 'all'
                    ? ` · ${agentHistoryConfidenceLabel(boardConfidenceFilter)}`
                    : ''
                }`
              : boardConfidenceFilter !== 'all' &&
                  boardMemberFilter === 'all' &&
                  boardScoreFilter === 'all' &&
                  boardRecencyFilter === 'all'
                ? `No tasks with confidence ${agentHistoryConfidenceLabel(boardConfidenceFilter)}`
                : boardRecencyFilter !== 'all' &&
                    boardMemberFilter === 'all' &&
                    boardScoreFilter === 'all' &&
                    boardConfidenceFilter === 'all'
                  ? `No tasks from ${agentHistoryRecencyLabel(boardRecencyFilter).toLowerCase()}`
                  : boardScoreFilter !== 'all' &&
                      boardMemberFilter === 'all' &&
                      boardConfidenceFilter === 'all'
                    ? `No tasks with score ${agentHistoryScoreLabel(boardScoreFilter)}`
                    : boardMemberFilter !== 'all'
                      ? `${memberNameById[boardMemberFilter] || 'This member'} has no tasks on the board yet`
                      : 'No tasks on the board'}
          </p>
          <button
            type="button"
            onClick={() => {
              setBoardQuery('');
              setBoardMemberFilter('all');
              setBoardScoreFilter('all');
              setBoardRecencyFilter('all');
              setBoardConfidenceFilter('all');
              boardSearchRef.current?.focus();
            }}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              color: '#C4956A',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {(boardMemberFilter !== 'all' ||
              boardScoreFilter !== 'all' ||
              boardRecencyFilter !== 'all' ||
              boardConfidenceFilter !== 'all') &&
            !boardQuery.trim()
              ? 'Show all tasks'
              : 'Clear filters'}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          {filteredBoardTasks.map((t: any) => {
            const mem = members.find((m: any) => m.user_id === t.user_id);
            const name = mem?.name || 'Member';
            const excerpt = getExcerpt(t);
            const fullAnswer = resolveRoomTaskAnswerBody(t.final_answer);
            const canExpand = roomTaskAnswerExpandable(t.final_answer, 140);
            const isExpanded = expandedTaskId === t.task_id;
            const canRemove = user && (t.user_id === user.id || room?.creator_id === user.id);
            return (
              <div
                key={t.task_id}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setHoverTask(t.task_id)}
                onMouseLeave={() => setHoverTask(null)}
                onClick={() => navigate(`/agent?task_id=${encodeURIComponent(t.task_id)}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/agent?task_id=${encodeURIComponent(t.task_id)}`);
                }}
                style={{
                  position: 'relative',
                  background: '#FAF7F2',
                  border:
                    isExpanded || hoverTask === t.task_id
                      ? '0.5px solid #C4956A'
                      : '0.5px solid #E0D5C5',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: hoverTask === t.task_id ? '0 2px 8px rgba(196,149,106,0.12)' : 'none',
                }}
              >
                {canRemove && hoverTask === t.task_id ? (
                  <button
                    type="button"
                    onClick={(e) => void handleRemoveTask(t.task_id, e)}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 12,
                      background: 'none',
                      border: 'none',
                      fontSize: 12,
                      color: '#C4A882',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                ) : null}
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: getUserColor(t.user_id),
                      color: '#FAF7F2',
                      fontSize: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getUserInitials(name)}
                  </div>
                  <span style={{ fontSize: 11, color: '#A89070' }}>{name}</span>
                  <span style={{ flex: 1, minWidth: 4 }} />
                  {t.final_score != null ? (
                    <span style={{ fontSize: 10, color: '#C4956A' }}>{t.final_score}/100</span>
                  ) : null}
                  {(() => {
                    const conf = formatHistoryConfidenceBadge(t.final_confidence);
                    if (!conf) return null;
                    return (
                      <span
                        title={`Confidence ${conf}`}
                        aria-label={`Confidence ${conf}`}
                        style={{ fontSize: 10, color: '#8C5A2C' }}
                      >
                        {conf}
                      </span>
                    );
                  })()}
                  <span
                    style={{ fontSize: 10, color: '#A89070' }}
                    title={roomBoardTimeTitle(t.created_at) || undefined}
                  >
                    {formatRoomBoardRelative(t.created_at, nowMs)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: '#2C1810',
                    fontWeight: 500,
                    lineHeight: 1.4,
                    marginBottom: 6,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  <HighlightQuery text={getTaskTitle(t)} query={boardQuery} />
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void copyBoardTaskQuestion(t)}
                    style={{
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: '#C4956A',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    Copy question
                  </button>
                  {fullAnswer ? (
                    <button
                      type="button"
                      onClick={() => void copyBoardTaskAnswer(t)}
                      style={{
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#C4956A',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      Copy answer
                    </button>
                  ) : null}
                </div>
                {isExpanded && canExpand && fullAnswer ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{ marginTop: 2 }}
                  >
                    <AgentAnswerMarkdown
                      markdown={fullAnswer}
                      question={getTaskTitle(t)}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#8C7355',
                      fontStyle: 'italic',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {excerpt}
                  </div>
                )}
                {canExpand ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedTaskId((id) => (id === t.task_id ? null : t.task_id));
                    }}
                    style={{
                      marginTop: 8,
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: '#C4956A',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {isExpanded ? 'Show less' : 'Show full answer'}
                  </button>
                ) : null}
                {isExpanded ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/agent?task_id=${encodeURIComponent(t.task_id)}`);
                    }}
                    style={{
                      display: 'block',
                      marginTop: 6,
                      padding: 0,
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: '#8C7355',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    Open in Agent →
                  </button>
                ) : null}
              </div>
            );
          })}
          {user && isMember ? (
            <button
              type="button"
              onClick={() => setShowTaskPicker(true)}
              style={{
                border: '0.5px dashed #D4C4B0',
                borderRadius: 10,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                color: '#C4A882',
                fontSize: 13,
                background: 'transparent',
              }}
            >
              + Add task
            </button>
          ) : null}
        </div>
      )}
      {filteredBoardTasks.length === 0 && user && isMember ? (
        <button
          type="button"
          onClick={() => setShowTaskPicker(true)}
          style={{
            border: '0.5px dashed #D4C4B0',
            borderRadius: 10,
            padding: 14,
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            color: '#C4A882',
            fontSize: 13,
            background: 'transparent',
          }}
        >
          + Add task
        </button>
      ) : null}
    </div>
    );

  if (!slug) {
    return <div style={{ padding: 24 }}>Invalid room</div>;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8C7355' }}>Loading…</span>
      </div>
    );
  }

  if (loadErr || !room) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F5F0E8',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#C4956A',
            marginBottom: 12,
          }}
        >
          Room
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 500,
            color: '#1A1714',
            fontFamily: 'Georgia, serif',
          }}
        >
          Couldn’t open this room
        </h1>
        <p
          role="alert"
          style={{
            margin: '12px auto 0',
            maxWidth: 400,
            fontSize: 14,
            color: '#6B6460',
            lineHeight: 1.6,
          }}
        >
          {loadErr || 'This room may have been removed, or the invite link is no longer valid.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
          <MotionButton
            type="button"
            variant="primary"
            size="md"
            onClick={() => void loadRoom()}
          >
            Try again
          </MotionButton>
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--md"
            onClick={() => navigate('/app')}
          >
            Back to Arena
          </button>
          <button
            type="button"
            className="arena-btn arena-btn--ghost arena-btn--md"
            onClick={() => navigate('/')}
          >
            Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F0E8' }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {!user ? (
        <div
          style={{
            background: '#FDF6EC',
            borderBottom: '0.5px solid #E8C87A',
            padding: '10px 16px',
            fontSize: 13,
            color: '#854F0B',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>Sign in to join this room and add tasks</span>
          <button
            type="button"
            onClick={() => {
              setRedirectIntent(`/room/${slug}`);
              navigate('/signin');
            }}
            style={{
              background: '#1A1714',
              color: '#FAF7F4',
              border: 'none',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'Georgia, serif',
            }}
          >
            Sign in
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div
          role="alert"
          style={{
            background: 'rgba(153, 60, 29, 0.08)',
            borderBottom: '0.5px solid rgba(153, 60, 29, 0.25)',
            padding: '10px 16px',
            fontSize: 13,
            color: '#993C1D',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#993C1D',
              cursor: 'pointer',
              fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {inviteToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            background: '#1A1714',
            color: '#FAF7F4',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Link copied!
        </div>
      ) : null}

      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: 52,
          background: 'rgba(245, 240, 232, 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: '0.5px solid #EDE4D8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: '#2C1810', cursor: 'pointer', fontSize: 14, fontFamily: 'Georgia, serif', fontWeight: 500, flexShrink: 0 }}
          >
            ← Arena
          </button>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 500, color: '#2C1810', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
              {room.name}
            </span>
            <span style={{ fontSize: 11, color: '#A89070' }}>
              {members.length} researcher{members.length !== 1 ? 's' : ''} · {tasks.length} task{tasks.length !== 1 ? 's' : ''}{contradictions.length > 0 ? ` · ${contradictions.length} contradiction${contradictions.length !== 1 ? 's' : ''} found` : ''}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {members.slice(0, 8).map((m: any, idx: number) => (
            <div
              key={m.user_id}
              title={m.name}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: getUserColor(m.user_id),
                color: '#FAF7F2',
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: idx > 0 ? -6 : 0,
                border: '2px solid #F5F0E8',
                position: 'relative',
              }}
            >
              {getUserInitials(m.name || '')}
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: roomMemberOnline(m.last_seen_at, nowMs) ? '#639922' : '#D4C4B0',
                  border: '1px solid #F5F0E8',
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {nativeShareAvailable ? (
            <button
              type="button"
              onClick={() => void shareInvite()}
              aria-label={
                inviteShareStatus === 'shared'
                  ? 'Invite shared'
                  : inviteShareStatus === 'failed'
                    ? 'Share failed'
                    : 'Share invite via system share sheet'
              }
              style={{
                background: 'rgba(196,149,106,0.15)',
                border: '0.5px solid rgba(196,149,106,0.4)',
                color:
                  inviteShareStatus === 'failed'
                    ? '#F0997B'
                    : inviteShareStatus === 'shared'
                      ? '#A8C5A0'
                      : '#C4956A',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                borderRadius: 999,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              {inviteShareStatus === 'shared'
                ? '✓ Shared'
                : inviteShareStatus === 'failed'
                  ? 'Share failed'
                  : 'Share invite'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyInvite()}
            aria-label={inviteToast ? 'Invite link copied' : 'Copy invite link'}
            style={{
              background: nativeShareAvailable ? 'transparent' : 'rgba(196,149,106,0.15)',
              border: '0.5px solid rgba(196,149,106,0.4)',
              color: '#C4956A',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              borderRadius: 999,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            {inviteToast ? '✓ Link copied!' : nativeShareAvailable ? 'Copy link' : 'Copy invite link'}
          </button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, overflow: 'hidden' }}>
        {!isMobile ? (
          <aside
            style={{
              width: 200,
              flexShrink: 0,
              borderRight: '0.5px solid #EDE4D8',
              padding: 16,
              overflowY: 'auto',
            }}
          >
            {sidebarInner}
          </aside>
        ) : null}

        <main
          style={{
            flex: 1,
            padding: 20,
            paddingBottom: isMobile ? 72 : 20,
            overflowY: 'auto',
            maxWidth: 900,
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {isMobile && mobileTab === 'members' ? <div style={{ marginBottom: 16 }}>{sidebarInner}</div> : null}
          {isMobile && mobileTab === 'synthesis' ? (
            <>
              {synthesisInner}
              {slug ? (
                <PerspectiveDriftPanel
                  slug={slug}
                  taskCount={tasks.length}
                  roomName={room?.name}
                />
              ) : null}
            </>
          ) : null}
          {!isMobile ? (
            <>
              {synthesisInner}
              {slug ? (
                <PerspectiveDriftPanel
                  slug={slug}
                  taskCount={tasks.length}
                  roomName={room?.name}
                />
              ) : null}
            </>
          ) : null}
          {isMobile && mobileTab === 'tasks' ? tasksGrid : null}
          {!isMobile ? tasksGrid : null}
        </main>
      </div>

      {showTaskPicker && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="presentation"
              onMouseDown={() => closeTaskPicker()}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 300,
                background: 'rgba(26, 23, 20, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="room-task-picker-title"
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: 'min(480px, 100%)',
                  background: '#FDFAF6',
                  borderRadius: 14,
                  border: '0.5px solid #DDD0BC',
                  maxHeight: '90vh',
                  overflow: 'auto',
                }}
              >
                <div style={{ borderBottom: '0.5px solid #EDE4D8', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span id="room-task-picker-title" style={{ fontSize: 16, color: '#2C1810', fontWeight: 500 }}>
                    Add a task to this room
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#8C7355' }}
                    onClick={() => closeTaskPicker()}
                  >
                    ×
                  </button>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#A89070' }}>From your history</div>
                    {historyTasks.length > 0 ? (
                      <span style={{ fontSize: 10, color: '#A89070' }}>
                        {filteredHistoryTasks.length}
                        {pickerQuery.trim() ? ` / ${historyTasks.length}` : ''}
                      </span>
                    ) : null}
                  </div>
                  {historyTasks.length > 0 ? (
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <input
                        ref={pickerSearchRef}
                        type="search"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Search history…"
                        aria-label="Search agent history to add"
                        autoComplete="off"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          fontSize: 12,
                          fontFamily: 'Georgia, serif',
                          color: '#2C1810',
                          background: '#FAF7F2',
                          border: '0.5px solid #E0D5C5',
                          borderRadius: 8,
                          padding: '7px 28px 7px 10px',
                          outline: 'none',
                        }}
                      />
                      {pickerQuery ? (
                        <button
                          type="button"
                          aria-label="Clear history search"
                          onClick={() => {
                            setPickerQuery('');
                            pickerSearchRef.current?.focus();
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
                  ) : null}
                  {historyLoading ? (
                    <p style={{ fontSize: 12, color: '#A89070' }}>Loading…</p>
                  ) : historyTasks.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#A89070' }}>No tasks to add</p>
                  ) : filteredHistoryTasks.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#A89070', marginBottom: 20 }}>
                      No history matches “{pickerQuery.trim()}”
                      <button
                        type="button"
                        onClick={() => {
                          setPickerQuery('');
                          pickerSearchRef.current?.focus();
                        }}
                        style={{
                          display: 'block',
                          marginTop: 8,
                          background: 'none',
                          border: 'none',
                          color: '#C4956A',
                          fontSize: 12,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Clear search
                      </button>
                    </p>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 20 }}>
                      {filteredHistoryTasks.map((ht: any) => (
                        <button
                          key={ht.task_id}
                          type="button"
                          onClick={() => void handleAddExisting(ht.task_id)}
                          className="room-history-pick"
                        >
                          <HighlightQuery
                            text={`${(ht.task_text || '').slice(0, 80)}${(ht.task_text || '').length > 80 ? '…' : ''}`}
                            query={pickerQuery}
                          />
                          <span className="room-history-pick__score">
                            {ht.final_score != null ? `${ht.final_score}/100` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#A89070', marginBottom: 8 }}>Run a new task</div>
                  <textarea
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    placeholder="Your research question…"
                    rows={3}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '0.5px solid #D4C4B0',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontSize: 13,
                      fontFamily: 'Georgia, serif',
                      color: '#2C1810',
                      background: '#FDFAF6',
                      marginBottom: 12,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem('pending_room_slug', slug);
                        sessionStorage.setItem('pending_room_name', room?.name || '');
                      } catch {
                        /* ignore */
                      }
                      const q = newTaskText.trim();
                      closeTaskPicker();
                      navigate(q ? `/agent?q=${encodeURIComponent(q)}` : '/agent');
                    }}
                    style={{
                      background: '#2C1810',
                      color: '#C4956A',
                      border: 'none',
                      borderRadius: 20,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontFamily: 'Georgia, serif',
                      cursor: 'pointer',
                    }}
                  >
                    Run in room →
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {isMobile ? (
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 60,
            display: 'flex',
            borderTop: '0.5px solid #EDE4D8',
            background: '#FDFAF6',
            paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))',
            boxShadow: '0 -2px 12px rgba(44,24,16,0.06)',
          }}
          aria-label="Room sections"
        >
          {(['members', 'synthesis', 'tasks'] as const).map((tab) => {
            const active = mobileTab === tab;
            const label = tab === 'members' ? 'Members' : tab === 'synthesis' ? 'Synthesis' : 'Tasks';
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                style={{
                  flex: 1,
                  minHeight: 52,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  border: 'none',
                  borderTop: active ? '3px solid #C4956A' : '3px solid transparent',
                  background: 'transparent',
                  color: active ? '#2C1810' : '#A89070',
                  cursor: 'pointer',
                  padding: '8px 4px',
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
                  {tab === 'members' ? '◎' : tab === 'synthesis' ? '◇' : '▢'}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <KeyboardShortcutsHelp surface="room" />
    </div>
  );
}
