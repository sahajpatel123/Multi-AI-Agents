import { useState, type ReactNode } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Ellipsis,
} from 'lucide-react';

interface SessionTurn {
  turn_id: string;
  prompt: string;
  winner_id: string;
  timestamp: string;
}

interface SidebarProps {
  turns: SessionTurn[];
  activeTurnId: string | null;
  onTurnClick: (turnId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ turns, activeTurnId, onTurnClick, isOpen, onClose }: SidebarProps) {
  // Reverse turns to show newest first
  const reversedTurns = [...turns].reverse();

  return (
    <>
      {/* Sidebar panel */}
      <div
        className={`fixed left-0 top-0 h-full bg-surface border-r border-border z-40
                    transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '320px',
          maxWidth: '88vw',
          boxShadow: '12px 0 38px rgba(26, 23, 20, 0.16)',
          background:
            'linear-gradient(180deg, rgba(252,250,248,0.98) 0%, rgba(247,243,239,0.98) 100%)',
        }}
      >
        <div className="flex flex-col h-full px-4 py-5">
          <div className="space-y-2">
            <MenuAction icon={<Plus className="w-5 h-5" />} label="New chat" isPrimary />
            <MenuAction icon={<Search className="w-5 h-5" />} label="Search" />
          </div>

          <div className="mt-2 space-y-2">
            <MenuAction icon={<MessageSquare className="w-5 h-5" />} label="Chats" />
          </div>

          <div className="mt-6 mb-2">
            <p className="text-[13px] tracking-[0.01em] text-text-secondary/85">Recents</p>
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {reversedTurns.length > 0 ? (
              <div className="space-y-1">
                {reversedTurns.map((turn) => {
                  const isActive = turn.turn_id === activeTurnId;
                  return (
                    <button
                      key={turn.turn_id}
                      onClick={() => onTurnClick(turn.turn_id)}
                      className="w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200"
                      style={{
                        background: isActive ? 'rgba(20, 18, 16, 0.06)' : 'transparent',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-text-primary truncate" style={{ fontSize: '14px', lineHeight: '1.35' }}>
                          {turn.prompt}
                        </p>
                        {isActive ? (
                          <Ellipsis className="w-4 h-4 shrink-0 text-text-secondary/80" />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="rounded-2xl border border-border px-4 py-4"
                style={{ background: 'rgba(255, 255, 255, 0.35)' }}
              >
                <p className="text-[12px] leading-relaxed text-text-secondary">
                  Your prompts will appear here once you run one.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border/60">
            <p className="text-xs text-text-secondary/75">{turns.length} {turns.length === 1 ? 'prompt' : 'prompts'}</p>
          </div>
        </div>
      </div>

      {/* Overlay — close sidebar when clicking outside */}
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
}

function MenuAction({ icon, label, isPrimary = false }: MenuActionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 text-left"
      type="button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.4s ease',
        backdropFilter: isHovered ? 'blur(20px)' : 'blur(0px)',
        boxShadow: isHovered
          ? '0 12px 36px rgba(26, 23, 20, 0.14), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.3)'
          : 'none',
        border: isHovered ? '1px solid rgba(255,255,255,0.7)' : '1px solid transparent',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: isHovered ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
          background: `linear-gradient(
            135deg,
            rgba(255,255,255,0.45) 0%,
            rgba(255,255,255,0.15) 40%,
            rgba(255,255,255,0.0) 60%,
            rgba(26, 23, 20, 0.08) 100%
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
      <span className="font-medium text-text-primary/92" style={{ fontSize: '15px', lineHeight: '1.15' }}>
        {label}
      </span>
    </button>
  );
}
