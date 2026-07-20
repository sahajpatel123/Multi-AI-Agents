import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../lib/clipboard';
import { DocsPage } from './DocsPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../lib/clipboard', () => ({ copyToClipboard: vi.fn().mockResolvedValue(true) }));
vi.mock('../components/Navbar', () => ({ Navbar: () => <header data-testid="navbar" /> }));
vi.mock('../components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

function renderPage() {
  return render(<MemoryRouter><DocsPage /></MemoryRouter>);
}

describe('DocsPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    window.history.replaceState({}, '', '/docs');
    vi.mocked(copyToClipboard).mockReset().mockResolvedValue(true);
  });

  it('renders all seven field chapters inside the shared public shell', () => {
    const { container } = renderPage();

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /understand the system/i })).toBeInTheDocument();
    expect(container.querySelectorAll('.docs-field-chapter')).toHaveLength(7);
    expect(screen.getByRole('heading', { name: /from clone to first verdict/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /one prompt\. five model roles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /defence belongs inside the runtime/i })).toBeInTheDocument();
  });

  it('exposes exactly seven public Agent stages and updates the selected-stage inspector', () => {
    const { container } = renderPage();
    const pipeline = container.querySelector('.docs-pipeline');
    expect(pipeline).not.toBeNull();

    const stageButtons = within(pipeline as HTMLElement).getAllByRole('button');
    expect(stageButtons).toHaveLength(7);
    expect(pipeline).not.toHaveTextContent(/steelman/i);
    const proof = container.querySelector('.docs-field-proof');
    expect(proof).toHaveTextContent(/07visible Agent stages/i);

    const plan = within(pipeline as HTMLElement).getByRole('button', { name: /stage 01: plan/i });
    const verify = within(pipeline as HTMLElement).getByRole('button', { name: /stage 05: verify/i });
    expect(plan).toHaveAttribute('aria-pressed', 'true');
    expect(verify).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(verify);
    expect(plan).toHaveAttribute('aria-pressed', 'false');
    expect(verify).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Verify', level: 3 })).toBeInTheDocument();
    expect(screen.getByText(/checks consequential claims and records what can or cannot be established/i)).toBeInTheDocument();
    expect(screen.getByText(/bounded to two refinement passes/i)).toBeInTheDocument();
  });

  it('switches the live API route group with pressed-state semantics', () => {
    const explorer = renderPage().container.querySelector('.docs-api-explorer');
    expect(explorer).not.toBeNull();

    const arena = within(explorer as HTMLElement).getByRole('button', { name: /show arena endpoints/i });
    const billing = within(explorer as HTMLElement).getByRole('button', { name: /show billing endpoints/i });
    expect(arena).toHaveAttribute('aria-pressed', 'true');
    expect(within(explorer as HTMLElement).getByText('POST /api/prompt')).toBeInTheDocument();

    fireEvent.click(billing);
    expect(arena).toHaveAttribute('aria-pressed', 'false');
    expect(billing).toHaveAttribute('aria-pressed', 'true');
    expect(within(explorer as HTMLElement).getByText('POST /api/payments/webhook')).toBeInTheDocument();
    expect(within(explorer as HTMLElement).getByText(/signed webhook lifecycle/i)).toBeInTheDocument();
  });

  it('filters chapters, reports the live count, clears the query, and renders an empty state', () => {
    renderPage();
    const search = screen.getByRole('searchbox', { name: /search documentation/i });

    fireEvent.change(search, { target: { value: 'security' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 chapter match');
    expect(screen.getByRole('heading', { name: /defence belongs inside the runtime/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /from clone to first verdict/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear documentation search/i }));
    expect(search).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('7 chapters available');

    fireEvent.change(search, { target: { value: 'no-such-field-entry' } });
    expect(screen.getByRole('heading', { name: /nothing in the field manual matches/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByRole('heading', { name: /from clone to first verdict/i })).toBeInTheDocument();
  });

  it('supports the slash search shortcut and Escape clearing without stealing form focus', () => {
    renderPage();
    const search = screen.getByRole('searchbox', { name: /search documentation/i });

    fireEvent.keyDown(window, { key: '/' });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: 'stream' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');

    const focusGuard = document.createElement('input');
    document.body.appendChild(focusGuard);
    focusGuard.focus();
    fireEvent.keyDown(focusGuard, { key: '/' });
    expect(focusGuard).toHaveFocus();
    focusGuard.remove();
  });

  it('copies setup commands through the shared clipboard helper and reports success', async () => {
    renderPage();
    const copyButton = screen.getByRole('button', { name: /copy backend \/ terminal 01/i });
    fireEvent.click(copyButton);

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1));
    expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('alembic upgrade head'));
    expect(copyButton).toHaveTextContent(/copied/i);
  });

  it('announces clipboard failure without using the browser clipboard directly', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    renderPage();
    const copyButton = screen.getByRole('button', { name: /copy frontend \/ terminal 02/i });
    fireEvent.click(copyButton);

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(expect.stringContaining('npm run dev')));
    expect(copyButton).toHaveAccessibleName(/copy failed for frontend/i);
  });

  it('preserves canonical runtime, plan, provider, and local-execution boundaries', () => {
    renderPage();

    expect(screen.getByText(/fetch \+ ReadableStream \+ AbortController/i)).toBeInTheDocument();
    expect(screen.getByText(/missing optional provider keys fall back to Claude/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Messages / day' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tokens / day' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '₹599/mo add-on' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Included' })).toBeInTheDocument();
    expect(screen.getByText(/rolling 45-message \/ 5-hour window/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /browser does not control your machine/i })).toBeInTheDocument();
    expect(screen.getByText(/requires Condura—a separate local-first daemon/i)).toBeInTheDocument();
  });

  it('tracks the current chapter across direct and history hash navigation', async () => {
    window.history.replaceState({}, '', '/docs#security');
    const chapterNav = renderPage().container.querySelector('.docs-field-nav nav');
    expect(chapterNav).not.toBeNull();

    const security = within(chapterNav as HTMLElement).getByRole('link', { name: /security/i });
    const api = within(chapterNav as HTMLElement).getByRole('link', { name: /api surface/i });
    await waitFor(() => expect(security).toHaveAttribute('aria-current', 'location'));

    window.history.replaceState({}, '', '/docs#api');
    fireEvent(window, new Event('hashchange'));
    await waitFor(() => expect(api).toHaveAttribute('aria-current', 'location'));
    expect(security).not.toHaveAttribute('aria-current');
  });

  it('routes field-manual calls to product, pricing, signup, and changelog', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /product overview/i }));
    fireEvent.click(screen.getByRole('button', { name: /compare full pricing/i }));
    fireEvent.click(screen.getByRole('button', { name: /start free/i }));
    fireEvent.click(screen.getByRole('button', { name: /view changelog/i }));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/product');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/pricing');
    expect(navigateMock).toHaveBeenNthCalledWith(3, '/signin?tab=signup');
    expect(navigateMock).toHaveBeenNthCalledWith(4, '/changelog');
  });
});
