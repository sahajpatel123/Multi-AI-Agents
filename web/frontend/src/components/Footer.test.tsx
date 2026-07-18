import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './Footer';

// Stub fetch to avoid the Footer's health probe hitting the real /api/health.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function mockHealthResponse(body: { status?: string; database?: string } = { status: 'healthy' }) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockHealthResponse();
  });

  it('renders the brand and tagline', async () => {
    const { getByLabelText, getByText, getByRole } = renderFooter();
    expect(getByLabelText(/arena home/i)).toBeInTheDocument();
    expect(
      getByText(/Four minds\. One question\. The best answer wins\./i),
    ).toBeInTheDocument();
    expect(getByRole('button', { name: /back to top/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i),
    );
  });

  it('renders Product and Company nav links', async () => {
    const { getByText, getByRole } = renderFooter();
    expect(getByRole('navigation', { name: /footer/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /^Product$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Capabilities/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Pricing/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /Changelog/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /About/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /^Terms$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /^Privacy$/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i),
    );
  });

  it('shows operational status when health is healthy', async () => {
    const { getByRole } = renderFooter();
    await waitFor(() => {
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i);
    });
  });

  it('shows degraded status when health reports degraded', async () => {
    mockHealthResponse({ status: 'degraded' });
    const { getByRole } = renderFooter();
    await waitFor(() => {
      expect(getByRole('status')).toHaveTextContent(/systems degraded/i);
    });
  });

  it('shows unavailable when the health probe fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const { getByRole } = renderFooter();
    await waitFor(() => {
      expect(getByRole('status')).toHaveTextContent(/status unavailable/i);
    });
  });

  it('renders a copyright line with the current year', async () => {
    const { getByText, getByRole } = renderFooter();
    const year = new Date().getFullYear().toString();
    expect(getByText(new RegExp(year))).toBeInTheDocument();
    await waitFor(() =>
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i),
    );
  });

  it('clicking the brand control is interactive', async () => {
    const { getByLabelText, getByRole } = renderFooter();
    const brand = getByLabelText(/arena home/i);
    expect(brand).toBeInTheDocument();
    fireEvent.click(brand);
    await waitFor(() =>
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i),
    );
  });

  it('uses contentinfo landmark', async () => {
    const { getByRole } = renderFooter();
    expect(getByRole('contentinfo')).toHaveClass('site-footer');
    await waitFor(() =>
      expect(getByRole('status')).toHaveTextContent(/all systems operational/i),
    );
  });
});
