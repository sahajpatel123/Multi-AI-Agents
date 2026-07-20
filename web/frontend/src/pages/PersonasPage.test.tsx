import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PersonasPage } from './PersonasPage';
import type { Persona } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';

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
    temperature: 0.7,
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
    temperature: 0.5,
    description: 'Trade-off focused.',
    locked: false,
    slot: 3,
  },
  {
    id: 'contrarian',
    name: 'The Contrarian',
    color: '#B0977E',
    bgTint: '#F2EDE8',
    quote: 'I say what no one else will.',
    temperature: 1,
    description: 'Challenges consensus.',
    locked: false,
    slot: 4,
  },
];

const catalogPersonas: Persona[] = [
  {
    id: 'scientist', name: 'The Scientist', color: '#7A9BAB', bgTint: '#EEF2F4',
    quote: 'Evidence, methodology, data.', temperature: 0.2,
    description: 'Empirical method.', locked: true, slot: null,
  },
  {
    id: 'strategist', name: 'The Strategist', color: '#AA957A', bgTint: '#F2F0EE',
    quote: 'Where is the leverage?', temperature: 0.5,
    description: 'Finds asymmetric moves.', locked: false, slot: null,
  },
  {
    id: 'historian', name: 'The Historian', color: '#9B8A7A', bgTint: '#F2EEE8',
    quote: 'Every pattern has a precedent.', temperature: 0.3,
    description: 'Finds useful precedent.', locked: false, slot: null,
  },
  {
    id: 'economist', name: 'The Economist', color: '#7A9B8A', bgTint: '#EEF2EE',
    quote: 'Incentives explain everything.', temperature: 0.4,
    description: 'Maps incentives.', locked: false, slot: null,
  },
  {
    id: 'ethicist', name: 'The Ethicist', color: '#AA8F9B', bgTint: '#F2EEF0',
    quote: 'What are the moral stakes?', temperature: 0.5,
    description: 'Names who bears the cost.', locked: false, slot: null,
  },
];

const allPersonas: Persona[] = [...defaultPanel, ...catalogPersonas];

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

const tierState = {
  canUsePersona: vi.fn().mockImplementation((id: string) => {
    const found = allPersonas.find((persona) => persona.id === id);
    return found ? !found.locked : false;
  }),
};

const navigateMock = vi.fn();
const setRedirectIntentMock = vi.fn();
const authState = { isAuthenticated: false };

vi.mock('../context/PanelContext', () => ({ usePanel: () => panelState }));
vi.mock('../context/TierContext', () => ({ useTier: () => tierState }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('../utils/redirectIntent', () => ({
  setRedirectIntent: (...args: unknown[]) => setRedirectIntentMock(...args),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../utils/track', () => ({ default: vi.fn() }));
vi.mock('../lib/clipboard', () => ({ copyToClipboard: vi.fn().mockResolvedValue(true) }));
vi.mock('../lib/downloadTextFile', () => ({ downloadMarkdownFile: vi.fn().mockReturnValue(true) }));
vi.mock('../components/Navbar', () => ({ Navbar: () => <header data-testid="navbar" /> }));
vi.mock('../components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('../components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
vi.mock('../components/HighlightQuery', () => ({ HighlightQuery: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('../components/EmptyState', () => ({ EmptyState: () => <div data-testid="empty-state" /> }));
vi.mock('../components/AgentDot', () => ({ AgentDot: () => <span data-testid="agent-dot" /> }));

function renderPage() {
  return render(<MemoryRouter><PersonasPage /></MemoryRouter>);
}

describe('PersonasPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    panelState.swapAgent.mockReset();
    panelState.resetPanel.mockReset();
    panelState.savePanel.mockReset().mockResolvedValue(undefined);
    tierState.canUsePersona.mockClear();
    setRedirectIntentMock.mockReset();
    authState.isAuthenticated = false;
    panelState.isDefaultPanel = true;
    vi.mocked(copyToClipboard).mockReset().mockResolvedValue(true);
    vi.mocked(downloadMarkdownFile).mockReset().mockReturnValue(true);
  });

  it('renders the complete panel studio and shared public shell', () => {
    const { container } = renderPage();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { name: /build useful disagreement/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.personas-studio-section')).toHaveLength(3);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders all four current panel slots as one live council composition', () => {
    const { container } = renderPage();
    const council = container.querySelector('.personas-council');
    const slotList = screen.getByRole('list', { name: /current panel slots/i });
    const names = Array.from(container.querySelectorAll('.personas-panel-card__name'))
      .map((element) => element.textContent?.trim());
    expect(council).toHaveStyle('--focus-color: #8C9BAB');
    expect(within(slotList).getAllByRole('listitem')).toHaveLength(4);
    expect(names).toEqual(['The Analyst', 'The Philosopher', 'The Pragmatist', 'The Contrarian']);
    expect(screen.getByLabelText(/current panel fingerprint/i)).toHaveTextContent(/productive tension/i);
    expect(screen.getByText(/configuration indicators describe persona settings—not answer quality/i)).toBeInTheDocument();
  });

  it('moves the shared inspection lens between slots without changing the panel', () => {
    const { container } = renderPage();
    const analyst = screen.getByRole('button', { name: /inspect the analyst lens in slot 1/i });
    const philosopher = screen.getByRole('button', { name: /inspect the philosopher lens in slot 2/i });
    const lens = screen.getByLabelText(/inspected panel lens/i);

    expect(analyst).toHaveAttribute('aria-pressed', 'true');
    expect(philosopher).toHaveAttribute('aria-pressed', 'false');
    expect(lens).toHaveTextContent(/which assumption breaks the case first/i);

    fireEvent.click(philosopher);

    expect(analyst).toHaveAttribute('aria-pressed', 'false');
    expect(philosopher).toHaveAttribute('aria-pressed', 'true');
    expect(lens).toHaveTextContent(/what if the question is framed incorrectly/i);
    expect(container.querySelector('.personas-council')).toHaveStyle('--focus-color: #9B8FAA');
    expect(panelState.swapAgent).not.toHaveBeenCalled();
  });

  it('switches the illustrative lens preview with pressed-button semantics', () => {
    renderPage();
    const group = screen.getByRole('group', { name: /lens preview scenario/i });
    const decision = within(group).getByRole('button', { name: /decision/i });
    const product = within(group).getByRole('button', { name: /product/i });
    expect(decision).toHaveAttribute('aria-pressed', 'true');
    expect(product).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(product);
    expect(decision).toHaveAttribute('aria-pressed', 'false');
    expect(product).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/solving a problem—or decorating one/i)).toBeInTheDocument();
    expect(screen.getByText(/not a live run/i)).toBeInTheDocument();
  });

  it('shows a concise initial index and discloses the complete catalog on demand', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('.personas-lib-card')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: /show all 9 minds/i }));
    expect(container.querySelectorAll('.personas-lib-card')).toHaveLength(9);
    expect(screen.getByRole('button', { name: /show fewer minds/i })).toBeInTheDocument();
  });

  it('inspects an unlocked mind and places it directly into a chosen slot', () => {
    renderPage();
    const strategistCard = screen.getByRole('button', { name: /the strategist.*where is the leverage/i });
    fireEvent.click(strategistCard);
    const profile = screen.getByLabelText(/selected mind: the strategist/i);
    fireEvent.click(within(profile).getByRole('button', { name: /place the strategist in slot 2/i }));
    expect(panelState.swapAgent).toHaveBeenCalledWith(1, expect.objectContaining({ id: 'strategist' }));
  });

  it('opens the accessible swap dialog and swaps an unlocked candidate', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /swap the analyst in slot 1/i }));
    const dialog = screen.getByRole('dialog', { name: /choose a counterweight/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: /the strategist/i }));
    expect(panelState.swapAgent).toHaveBeenCalledWith(0, expect.objectContaining({ id: 'strategist' }));
  });

  it('routes guests through sign-in before saving and preserves the Personas return intent', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /sign in to save panel/i }));
    expect(panelState.savePanel).not.toHaveBeenCalled();
    expect(setRedirectIntentMock).toHaveBeenCalledWith('/personas');
    expect(navigateMock).toHaveBeenCalledWith('/signin?tab=signin');
  });

  it('saves directly for authenticated visitors and reports save failures', async () => {
    authState.isAuthenticated = true;
    panelState.savePanel.mockRejectedValueOnce(new Error('Save unavailable'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /save this panel/i }));
    expect(panelState.savePanel).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(/save unavailable/i);
  });

  it('preserves panel copy, download, and two-step reset actions inside the council', async () => {
    panelState.isDefaultPanel = false;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /copy panel as markdown/i }));
    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('The Analyst')));

    fireEvent.click(screen.getByRole('button', { name: /download panel as markdown/i }));
    expect(downloadMarkdownFile).toHaveBeenCalledWith(
      expect.stringContaining('The Contrarian'),
      'arena-personas-panel',
    );

    fireEvent.click(screen.getByRole('button', { name: /reset panel to default minds/i }));
    expect(panelState.resetPanel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm reset panel to default minds/i }));
    expect(panelState.resetPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected profile consistent when availability filters remove a mind', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /the pragmatist.*what actually works/i }));
    expect(screen.getByLabelText(/selected mind: the pragmatist/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Locked' }));
    expect(screen.getByLabelText(/selected mind: the scientist/i)).toBeInTheDocument();
    expect(document.querySelectorAll('.personas-lib-card.is-selected')).toHaveLength(1);
  });

  it('portals the modal, traps focus, unlocks body scroll, and restores its trigger', async () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /swap the analyst in slot 1/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /choose a counterweight/i });
    const backdrop = dialog.parentElement;
    expect(backdrop).toHaveClass('personas-modal-backdrop');
    expect(backdrop?.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');

    const close = within(dialog).getByRole('button', { name: /close swap dialog/i });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toHaveClass('personas-swap-option');
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(document.querySelector('.personas-modal-backdrop')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });

  it('searches, clears, sorts, and filters the mind index', () => {
    const { container } = renderPage();
    const input = screen.getByLabelText('Search persona library');
    fireEvent.change(input, { target: { value: 'scientist' } });
    expect(container.querySelectorAll('.personas-lib-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /clear persona search/i }));
    expect(container.querySelector('.personas-sort-select')).toHaveAttribute('aria-label', 'Sort persona library');
    const locked = screen.getByRole('button', { name: 'Locked' });
    fireEvent.click(locked);
    expect(locked).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('.personas-lib-card--locked')).toHaveLength(1);
  });
});
