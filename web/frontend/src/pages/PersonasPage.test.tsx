import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonasPage } from './PersonasPage';
import type { Persona } from '../data/personas';

const defaultPanel: Persona[] = [
  {
    id: 'analyst',
    name: 'The Analyst',
    color: '#8C9BAB',
    bgTint: '#EEF0F2',
    quote: 'I find the flaw in everything.',
    temperature: 0.2,
    description: 'Stress-tests every claim.',
    locked: false,
    slot: 1,
  },
  {
    id: 'philosopher',
    name: 'The Philosopher',
    color: '#9B8FAA',
    bgTint: '#F0EDF2',
    quote: 'I question the premise first.',
    temperature: 0.3,
    description: 'Frames the deeper question.',
    locked: false,
    slot: 2,
  },
  {
    id: 'pragmatist',
    name: 'The Pragmatist',
    color: '#8AA899',
    bgTint: '#EFF2F0',
    quote: 'What actually works?',
    temperature: 0.4,
    description: 'Trade-off focused.',
    locked: false,
    slot: 3,
  },
  {
    id: 'futurist',
    name: 'The Futurist',
    color: '#9B8FAA',
    bgTint: '#F0EDF2',
    quote: 'What is the long arc?',
    temperature: 0.5,
    description: 'Projects the trajectory.',
    locked: false,
    slot: 4,
  },
];

const lockedPersona: Persona = {
  id: 'scientist',
  name: 'The Scientist',
  color: '#8C9BAB',
  bgTint: '#EEF0F2',
  quote: 'Run the experiment.',
  temperature: 0.2,
  description: 'Empirical method.',
  locked: true,
  slot: null,
};

const allPersonas: Persona[] = [...defaultPanel, lockedPersona];

const panelState: {
  panel: Persona[];
  personas: Persona[];
  swapAgent: ReturnType<typeof vi.fn>;
  resetPanel: ReturnType<typeof vi.fn>;
  savePanel: ReturnType<typeof vi.fn>;
  isDefaultPanel: boolean;
} = {
  panel: defaultPanel,
  personas: allPersonas,
  swapAgent: vi.fn(),
  resetPanel: vi.fn(),
  savePanel: vi.fn().mockResolvedValue(undefined),
  isDefaultPanel: true,
};

const tierState: {
  canUsePersona: ReturnType<typeof vi.fn>;
} = {
  canUsePersona: vi.fn().mockImplementation((id: string) => {
    const found = allPersonas.find((p) => p.id === id);
    return found ? !found.locked : false;
  }),
};

const navigateMock = vi.fn();

vi.mock('../context/PanelContext', () => ({
  usePanel: () => panelState,
}));

vi.mock('../context/TierContext', () => ({
  useTier: () => tierState,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../utils/track', () => ({
  default: vi.fn(),
}));

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/downloadTextFile', () => ({
  downloadMarkdownFile: vi.fn().mockReturnValue(true),
}));

vi.mock('../components/Navbar', () => ({
  Navbar: () => <header data-testid="navbar" />,
}));

vi.mock('../components/KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
}));

vi.mock('../components/HighlightQuery', () => ({
  HighlightQuery: ({ text }: { text: string }) => <>{text}</>,
}));

vi.mock('../components/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock('../components/AgentDot', () => ({
  AgentDot: () => <span data-testid="agent-dot" />,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <PersonasPage />
    </MemoryRouter>,
  );
}

describe('PersonasPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    panelState.swapAgent.mockReset();
    panelState.resetPanel.mockReset();
    panelState.savePanel.mockClear();
    tierState.canUsePersona.mockClear();
  });

  it('renders the four default panel cards', () => {
    const { container } = renderPage();
    const panelNames = Array.from(
      container.querySelectorAll('.personas-panel-card__name'),
    ).map((el) => el.textContent?.trim() ?? '');
    expect(panelNames).toEqual([
      'The Analyst',
      'The Philosopher',
      'The Pragmatist',
      'The Futurist',
    ]);
  });

  it('exposes the main landmark with id="main-content"', () => {
    renderPage();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('renders the library head with BEM classes', () => {
    const { container } = renderPage();
    expect(container.querySelector('.personas-library-head__row')).toBeTruthy();
    expect(container.querySelector('.personas-library-actions')).toBeTruthy();
    expect(container.querySelectorAll('.personas-library-action').length).toBe(2);
  });

  it('renders the search input with BEM class', () => {
    const { container } = renderPage();
    const searchEl = container.querySelector('.personas-search');
    expect(searchEl).toBeTruthy();
    const input = container.querySelector('.personas-search__input');
    expect(input).toBeTruthy();
    expect(input).toHaveAttribute('placeholder', 'Search minds…');
  });

  it('shows a clear button only when the search has a value', () => {
    const { container } = renderPage();
    expect(container.querySelector('.personas-search__clear')).toBeNull();
    const input = container.querySelector<HTMLInputElement>('.personas-search__input');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { value: 'analyst' } });
    const clear = container.querySelector('.personas-search__clear');
    expect(clear).toBeTruthy();
    fireEvent.click(clear!);
    expect(container.querySelector('.personas-search__clear')).toBeNull();
  });

  it('renders the availability filter pills with BEM class', () => {
    const { container } = renderPage();
    const filters = container.querySelector('.personas-availability');
    expect(filters).toBeTruthy();
    const pills = container.querySelectorAll('.personas-availability__pill');
    expect(pills.length).toBe(4);
    const active = container.querySelector('.personas-availability__pill--active');
    expect(active).toBeTruthy();
    expect(active?.textContent).toBe('All');
  });

  it('marks the selected availability pill with aria-pressed and the --active modifier', () => {
    const { container } = renderPage();
    const pills = container.querySelectorAll<HTMLButtonElement>(
      '.personas-availability__pill',
    );
    const lockedPill = Array.from(pills).find((p) => p.textContent === 'Locked');
    expect(lockedPill).toBeTruthy();
    fireEvent.click(lockedPill!);
    expect(lockedPill!.getAttribute('aria-pressed')).toBe('true');
    expect(lockedPill!.className).toContain('personas-availability__pill--active');
  });

  it('renders the sort select with the BEM class', () => {
    const { container } = renderPage();
    const select = container.querySelector('.personas-sort-select');
    expect(select).toBeTruthy();
    expect(select).toHaveAttribute('aria-label', 'Sort persona library');
  });

  it('renders at least one library card with the --locked modifier when a persona is locked', () => {
    const { container } = renderPage();
    const lockedCards = container.querySelectorAll('.personas-lib-card--locked');
    expect(lockedCards.length).toBeGreaterThan(0);
  });
});
