import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { SavedResponseItem } from '../types';

type MinimalSidebarTurn = {
  turn_id: string;
  prompt: string;
  prompt_category?: string;
  winner_id: string;
  timestamp: string;
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

vi.mock('../context/PanelContext', () => ({
  usePanel: () => ({
    panel: [],
    personas: [],
    swapAgent: vi.fn(),
    resetPanel: vi.fn(),
    savePanel: vi.fn(),
    isDefaultPanel: true,
  }),
}));

vi.mock('../context/ProfileModalContext', () => ({
  useProfileModal: () => ({
    openModal: vi.fn(),
  }),
}));

vi.mock('../context/TierContext', () => ({
  useTier: () => ({
    tier: 'FREE',
    dailyLimit: 5,
    messagesUsed: 0,
    messagesRemaining: 5,
    allowedPersonas: ['analyst', 'philosopher'],
    features: {},
    isPlus: false,
    isPro: false,
    isFree: true,
    canUsePersona: () => true,
    canUseFeature: () => false,
    refreshTier: vi.fn(),
  }),
}));

const savedItem: SavedResponseItem = {
  id: 1,
  session_id: 's1',
  turn_id: 't1',
  prompt: 'Should I ship today?',
  agent_id: 'analyst',
  persona_id: 'analyst',
  persona_name: 'The Analyst',
  one_liner: 'Ship small.',
  verdict: 'Risk is bounded if scope is tight.',
  timestamp: '2026-07-01T12:00:00Z',
  pinned: false,
};

function renderSidebar(overrides?: {
  onDeleteSaved?: (item: SavedResponseItem) => Promise<void> | void;
  onBulkDeleteSaved?: (ids: number[]) => Promise<number> | void;
  savedItems?: SavedResponseItem[];
}) {
  render(
    <Sidebar
      turns={[] as MinimalSidebarTurn[]}
      activeTurnId={null}
      onTurnClick={vi.fn()}
      onNewChat={vi.fn()}
      isOpen
      onClose={vi.fn()}
      onLeaderboardClick={vi.fn()}
      savedItems={overrides?.savedItems ?? [savedItem]}
      onSavedItemClick={vi.fn()}
      onReuseSavedPrompt={vi.fn()}
      onDeleteSaved={overrides?.onDeleteSaved}
      onBulkDeleteSaved={overrides?.onBulkDeleteSaved}
    />,
  );
}

describe('Sidebar saved-take delete', () => {
  it('deletes one saved take only after inline confirmation', async () => {
    const onDeleteSaved = vi.fn().mockResolvedValue(undefined);
    renderSidebar({ onDeleteSaved });

    fireEvent.click(screen.getByRole('button', { name: /delete the analyst take/i }));
    expect(onDeleteSaved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm delete the analyst take/i }));
    expect(onDeleteSaved).toHaveBeenCalledTimes(1);
    expect(onDeleteSaved).toHaveBeenCalledWith(
      expect.objectContaining({ id: savedItem.id }),
    );
  });

  it('cancels an inline delete without touching the callback', () => {
    const onDeleteSaved = vi.fn().mockResolvedValue(undefined);
    renderSidebar({ onDeleteSaved });

    fireEvent.click(screen.getByRole('button', { name: /delete the analyst take/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel delete the analyst take/i }));

    expect(onDeleteSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /confirm delete the analyst take/i })).toBeNull();
  });

  it('bulk-deletes the currently shown saved takes after confirmation', () => {
    const onBulkDeleteSaved = vi.fn().mockResolvedValue(2);
    renderSidebar({
      onBulkDeleteSaved,
      savedItems: [
        { ...savedItem, id: 1 },
        { ...savedItem, id: 2 },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /delete 2 shown saved takes/i }));
    const dialog = screen.getByRole('dialog', { name: /delete shown saved takes/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }));

    expect(onBulkDeleteSaved).toHaveBeenCalledTimes(1);
    expect(onBulkDeleteSaved).toHaveBeenCalledWith([1, 2]);
  });
});
