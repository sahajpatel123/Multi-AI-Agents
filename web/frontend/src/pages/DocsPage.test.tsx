import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsPage } from './DocsPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../components/Navbar', () => ({ Navbar: () => <header data-testid="navbar" /> }));
vi.mock('../components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

function renderPage() {
  return render(<MemoryRouter><DocsPage /></MemoryRouter>);
}

describe('DocsPage', () => {
  beforeEach(() => navigateMock.mockReset());

  it('renders the complete documentation chapters', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /build with multiple minds/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /from clone to first verdict/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /research that attacks itself/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /typed routes/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /defence is part/i })).toBeInTheDocument();
  });

  it('filters chapters with documentation search', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Search documentation'), { target: { value: 'security' } });
    expect(screen.getByRole('heading', { name: /defence is part/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /from clone to first verdict/i })).toBeNull();
  });

  it('routes the pricing call to the dedicated pricing page', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /compare full pricing/i }));
    expect(navigateMock).toHaveBeenCalledWith('/pricing');
  });
});
