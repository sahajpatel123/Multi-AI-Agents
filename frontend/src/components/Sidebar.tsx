import { useMemo, useState, type ReactNode } from 'react';
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
  isOpen,
  onClose,
  onLeaderboardClick,
  savedItems,
  onSavedItemClick,
}: SidebarProps) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const reversedTurns = useMemo(() => [...turns].reverse(), [turns]);
  const filteredTurns = useMemo(
    () => reversedTurns.filter((turn) => activeFilter === 'all' || turn.prompt_category === activeFilter),
    [activeFilter, reversedTurns],
  );

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
            <MenuAction icon={<Plus className="w-5 h-5" />} label="New chat" isPrimary />
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
                    if (!isActive) {
                      e.currentTarget.style.background = '#E0D8D0';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#F0EBE3';
                    }
                  }}
                >
                  {filter.icon}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 pb-4">
            {filteredTurns.length > 0 ? (
              <div className="space-y-1">
                {filteredTurns.map((turn) => {
                  const isActive = turn.turn_id === activeTurnId;
                  const winner = AGENTS[turn.winner_id];

                  return (
                    <button
                      key={turn.turn_id}
                      onClick={() => onTurnClick(turn.turn_id)}
                      className="w-full text-left rounded-lg px-3 py-2.5 transition-all duration-150"
                      style={{
                        background: isActive ? 'rgba(20, 18, 16, 0.06)' : 'transparent',
                        border: isActive ? '1px solid rgba(255,255,255,0.52)' : '1px solid transparent',
                        boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.62)' : 'none',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-text-primary truncate font-medium" style={{ fontSize: '14px', lineHeight: '1.35' }}>
                          {turn.prompt}
                        </p>
                        {isActive ? (
                          <Ellipsis className="w-4 h-4 shrink-0 text-text-secondary/80" />
                        ) : null}
                      </div>
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
                  );
                })}
              </div>
            ) : turns.length === 0 ? (
              <div
                className="rounded-2xl border border-border px-4 py-4"
                style={{ background: 'rgba(255, 255, 255, 0.35)' }}
              >
                <p className="text-[12px] font-medium leading-relaxed text-text-secondary">
                  Your prompts will appear here once you run one.
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
