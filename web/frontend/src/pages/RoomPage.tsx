import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { addRoomTask, getAgentHistory, getRoom, getRoomSynthesis, joinRoom, removeRoomTask } from '../api';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { getUserColor, getUserInitials } from '../utils/roomUtils';
import { copyToClipboard } from '../lib/clipboard';
import { filterBySearchQuery } from '../lib/sidebarSearch';
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

function onlineActive(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 5 * 60 * 1000;
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
  const [hoverTask, setHoverTask] = useState<string | null>(null);
  const [synthesisRefreshing, setSynthesisRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [boardQuery, setBoardQuery] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const boardSearchRef = useRef<HTMLInputElement | null>(null);
  const pickerSearchRef = useRef<HTMLInputElement | null>(null);

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

  const memberNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      if (m?.user_id) map[m.user_id] = m.name || 'Member';
    }
    return map;
  }, [members]);

  const filteredBoardTasks = useMemo(
    () =>
      filterBySearchQuery(tasks, boardQuery, (t) => [
        getTaskTitle(t),
        t.question,
        t.task_text,
        t.final_answer,
        memberNameById[t.user_id],
      ]),
    [tasks, boardQuery, memberNameById],
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

  const copyInvite = async () => {
    const url = room?.share_url || `${window.location.origin}/room/${slug}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setInviteToast(true);
      window.setTimeout(() => setInviteToast(false), 2000);
    } else {
      setActionError('Could not copy invite link — copy from the address bar instead.');
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
      {members.map((m: any) => (
        <div
          key={m.user_id}
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}
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
              background: onlineActive(m.last_seen_at) ? '#639922' : '#D4C4B0',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
          />
        </div>
      ))}
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
            <button
              type="button"
              title="Refresh synthesis"
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
                padding: '12px 12px 14px',
                borderTop: '0.5px solid #EDE4D8',
                marginTop: 4,
                fontSize: 13,
                color: '#4A3728',
                fontStyle: 'italic',
                lineHeight: 1.65,
              }}
            >
              {synthText}
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
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--md"
            style={{ marginTop: 18 }}
            onClick={() => setShowTaskPicker(true)}
          >
            Add your first task →
          </button>
        ) : !user ? (
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--md"
            style={{ marginTop: 18 }}
            onClick={() => {
              setRedirectIntent(`/room/${slug}`);
              navigate('/signin');
            }}
          >
            Sign in to join →
          </button>
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
            {boardQuery.trim() ? ` / ${tasks.length}` : ''}
          </span>
        </div>
        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
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
            No tasks match “{boardQuery.trim()}”
          </p>
          <button
            type="button"
            onClick={() => {
              setBoardQuery('');
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
            Clear search
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
                  border: hoverTask === t.task_id ? '0.5px solid #C4956A' : '0.5px solid #E0D5C5',
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
                  {t.final_score != null ? (
                    <span style={{ fontSize: 10, color: '#C4956A', marginLeft: 'auto' }}>{t.final_score}/100</span>
                  ) : null}
                  <span style={{ fontSize: 10, color: '#A89070' }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}
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
                  {getTaskTitle(t)}
                </div>
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
          <button
            type="button"
            className="arena-btn arena-btn--primary arena-btn--md"
            onClick={() => void loadRoom()}
          >
            Try again
          </button>
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
                  background: onlineActive(m.last_seen_at) ? '#639922' : '#D4C4B0',
                  border: '1px solid #F5F0E8',
                }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={copyInvite}
          style={{
            background: 'rgba(196,149,106,0.15)',
            border: '0.5px solid rgba(196,149,106,0.4)',
            color: '#C4956A',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderRadius: 999,
            padding: '6px 14px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {inviteToast ? '✓ Link copied!' : 'Copy invite link'}
        </button>
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
          {isMobile && mobileTab === 'synthesis' ? synthesisInner : null}
          {!isMobile ? synthesisInner : null}
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
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            border: 'none',
                            borderRadius: 6,
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: '#2C1810',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#F5EFE6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {(ht.task_text || '').slice(0, 80)}
                          {(ht.task_text || '').length > 80 ? '…' : ''}
                          <span style={{ color: '#C4956A', marginLeft: 8 }}>{ht.final_score != null ? `${ht.final_score}/100` : ''}</span>
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
    </div>
  );
}
