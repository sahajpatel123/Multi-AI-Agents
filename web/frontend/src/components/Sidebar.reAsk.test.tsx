import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  onReuseSavedPrompt?: () => void;
  onSavedItemClick?: () => void;
  savedItems?: SavedResponseItem[];
}) {
  const onReuseSavedPrompt = overrides?.onReuseSavedPrompt ?? vi.fn();
  const onSavedItemClick = overrides?.onSavedItemClick ?? vi.fn();
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
      onSavedItemClick={onSavedItemClick}
      onReuseSavedPrompt={onReuseSavedPrompt}
    />,
  );
  return { onReuseSavedPrompt, onSavedItemClick };
}

describe('Sidebar saved-take re-ask', () => {
  it('re-asks the saved prompt without opening the saved take', () => {
    const { onReuseSavedPrompt, onSavedItemClick } = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /re-ask the analyst take/i }));

    expect(onReuseSavedPrompt).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(onReuseSavedPrompt).mock.calls[0][0] as SavedResponseItem;
    expect(calledWith.id).toBe(savedItem.id);
    expect(calledWith.prompt).toBe(savedItem.prompt);
    expect(calledWith.agent_id).toBe(savedItem.agent_id);
    expect(onSavedItemClick).not.toHaveBeenCalled();
  });

  it('does not call the re-ask callback when it is not provided', () => {
    const { onSavedItemClick } = renderSidebar({ onReuseSavedPrompt: undefined });

    const button = screen.getByRole('button', { name: /re-ask the analyst take/i });
    fireEvent.click(button);
    expect(onSavedItemClick).not.toHaveBeenCalled();
  });

  it('shows the total pinned count in the saved header', () => {
    renderSidebar({
      savedItems: [
        { ...savedItem, id: 1, pinned: true },
        { ...savedItem, id: 2, pinned: false },
      ],
    });
    expect(screen.getByText(/pinned 1/i)).toBeTruthy();
  });

  it('hides the redundant pinned count when the pinned-only filter is active', () => {
    renderSidebar({
      savedItems: [{ ...savedItem, id: 1, pinned: true }],
    });
    fireEvent.click(screen.getByRole('button', { name: /pinned/i }));
    expect(screen.queryByText(/· pinned 1/i)).toBeNull();
  });
});
