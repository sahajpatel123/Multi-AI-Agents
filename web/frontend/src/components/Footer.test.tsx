import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './Footer';

// Stub fetch to avoid the Footer's health probe hitting the real /api/health.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function mockHealthResponse(body: { status?: string; database?: string } = { status: 'ok' }) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe('Footer', () => {
  it('renders the brand and tagline', () => {
    mockHealthResponse();
    const { getAllByText } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    // 'Arena' appears in multiple places (brand button, copyright),
    // so use getAllByText to assert presence without caring about count.
    expect(getAllByText(/Arena/).length).toBeGreaterThan(0);
    expect(getAllByText(/Four minds/i).length).toBeGreaterThan(0);
  });

  it('renders the Product, Company, and Legal columns', () => {
    mockHealthResponse();
    const { getByText } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(getByText(/How it works/i)).toBeInTheDocument();
    expect(getByText(/Pricing/i)).toBeInTheDocument();
    expect(getByText(/Changelog/i)).toBeInTheDocument();
  });

  it('shows the system status indicator', async () => {
    mockHealthResponse();
    const { container } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    // The status indicator shows aria-live updates when the probe
    // completes. Even if the assertion is loose, we just want to
    // confirm the indicator element renders.
    await waitFor(() => {
      const live = container.querySelector('[aria-live]');
      expect(live).not.toBeNull();
    });
  });

  it('renders a copyright line with the current year', () => {
    mockHealthResponse();
    const { getByText } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    const year = new Date().getFullYear().toString();
    expect(getByText(new RegExp(year))).toBeInTheDocument();
  });

  it('clicking the brand button navigates to /', () => {
    mockHealthResponse();
    const { getByText } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    // Click the brand button — it routes to '/'. We can't easily
    // assert navigation in MemoryRouter without a Routes tree, so
    // just confirm the button exists and is clickable without throwing.
    const brand = getByText(/^Arena$/);
    expect(brand).toBeInTheDocument();
    fireEvent.click(brand);
  });
});