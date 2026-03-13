import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Plus,
  Ellipsis,
  Trophy,
  LayoutGrid,
  HelpCircle,
  CheckSquare,
  MessageSquare,
  Swords,
  Bookmark,
  Pencil,
  Trash2,
} from 'lucide-react';
import { AGENTS, type PromptCategory, type SavedResponseItem } from '../types';
import { AgentDot } from './AgentDot';

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
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [openMenuTurnId, setOpenMenuTurnId] = useState<string | null>(null);
  const [confirmDeleteTurnId, setConfirmDeleteTurnId] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({});
  const [deletedTurnIds, setDeletedTurnIds] = useState<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const menuLayerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const reversedTurns = useMemo(
    () => [...turns].reverse().filter((turn) => !deletedTurnIds.has(turn.turn_id)),
    [turns, deletedTurnIds],
  );

  const filteredTurns = useMemo(
    () => reversedTurns.filter((turn) => activeFilter === 'all' || turn.prompt_category === activeFilter),
    [activeFilter, reversedTurns],
  );

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
    setEditingTurnId(turn.turn_id);
    setEditingValue(currentLabel);
    setOpenMenuTurnId(null);
    setConfirmDeleteTurnId(null);
  };

  const saveRename = (turnId: string) => {
    const nextValue = editingValue.trim();
    if (nextValue) {
      setCustomTitles((prev) => ({ ...prev, [turnId]: nextValue }));
    }
    setEditingTurnId(null);
    setEditingValue('');
  };

  const cancelRename = () => {
    setEditingTurnId(null);
    setEditingValue('');
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
        className={`fixed left-0 top-0 h-full bg-surface border-r border-border z-40
                    transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '308px',
          maxWidth: '88vw',
          boxShadow: '10px 0 30px rgba(26, 23, 20, 0.14)',
          background: 'linear-gradient(180deg, rgba(252,250,248,0.98) 0%, rgba(245,241,237,0.98) 100%)',
        }}
      >
        <div className="flex flex-col h-full px-4 py-6">
          <div className="mb-2">
            <MenuAction icon={<Plus className="w-5 h-5" />} label="New chat" isPrimary onClick={handleNewChatClick} />
          </div>
          <div className="mb-5">
            <MenuAction
              icon={<Trophy className="w-5 h-5" />}
              label="Leaderboard"
              onClick={onLeaderboardClick}
            />
          </div>

          <div className="mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-text-secondary/75">Recents</p>
          </div>
          <div className="flex items-center gap-2 mb-3">
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
                      className="relative rounded-lg px-3 py-2.5 transition-all duration-150"
                      style={{
                        background: isActive ? 'rgba(20, 18, 16, 0.06)' : 'transparent',
                        border: isActive ? '1px solid rgba(255,255,255,0.52)' : '1px solid transparent',
                        boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.62)' : 'none',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
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
                              onBlur={() => saveRename(turn.turn_id)}
                              className="w-full bg-white border border-border rounded-md px-2 py-1 text-[13px] text-text-primary outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onTurnClick(turn.turn_id)}
                              className="w-full text-left"
                            >
                              <p className="text-text-primary truncate font-medium" style={{ fontSize: '14px', lineHeight: '1.35' }}>
                                {displayTitle}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <AgentDot agentId={turn.winner_id} size={8} />
                                  <span className="text-xs text-text-secondary truncate">{winner.name}</span>
                                </div>
                                <span className="text-[11px] text-text-secondary/70 capitalize">
                                  {turn.prompt_category || 'unknown'}
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
              <div
                className="rounded-2xl border border-border px-4 py-4"
                style={{ background: 'rgba(255, 255, 255, 0.35)' }}
              >
                <p className="text-[12px] font-medium leading-relaxed text-text-secondary">
                  Your history will appear here.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-[12px] font-medium leading-relaxed text-text-secondary capitalize">
                  No {activeFilter} prompts yet
                </p>
              </div>
            )}

            {savedItems.length > 0 && (
              <div className="mt-6">
                <div className="mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-text-secondary/75">Saved</p>
                </div>
                <div className="space-y-1">
                  {[...savedItems].reverse().map((item) => {
                    const agent = AGENTS[item.agent_id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSavedItemClick(item)}
                        className="w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-all duration-150 hover:border-border hover:bg-white/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <AgentDot agentId={item.agent_id} size={8} />
                              <span className="text-xs font-medium text-text-primary">{agent.name}</span>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-text-secondary truncate">
                              {item.one_liner.slice(0, 40)}
                              {item.one_liner.length > 40 ? '…' : ''}
                            </p>
                          </div>
                          <Bookmark className="w-3.5 h-3.5 shrink-0 text-accent" style={{ fill: 'currentColor' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-text-primary/8 backdrop-blur-[1px] z-30 transition-opacity duration-300"
          onClick={onClose}
        />
      )}
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
      className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
      type="button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 150ms ease',
        backdropFilter: isHovered ? 'blur(8px)' : 'blur(0px)',
        boxShadow: isHovered
          ? '0 8px 18px rgba(26, 23, 20, 0.12), inset 0 1px 0 rgba(255,255,255,0.72)'
          : 'none',
        border: isHovered ? '1px solid rgba(255,255,255,0.65)' : '1px solid transparent',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 150ms ease',
          pointerEvents: 'none',
          background: `linear-gradient(
            140deg,
            rgba(255,255,255,0.24) 0%,
            rgba(255,255,255,0.1) 42%,
            rgba(255,255,255,0.0) 62%,
            rgba(26, 23, 20, 0.06) 100%
          )`,
        }}
      />
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: isPrimary ? 'rgba(20, 18, 16, 0.08)' : 'transparent',
        }}
      >
        <span className="text-text-primary/95">{icon}</span>
      </span>
      <span className="font-semibold text-text-primary/92" style={{ fontSize: '14px', lineHeight: '1.15' }}>
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
