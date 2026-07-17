import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentTitle } from './DocumentTitle';

describe('DocumentTitle', () => {
  it('sets document.title based on the active path', async () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <DocumentTitle />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(document.title).toMatch(/Pricing/),
    );
  });

  it('uses a brand-aware title for the index page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <DocumentTitle />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(document.title).toMatch(/Arena/),
    );
  });

  it('renders nothing in the DOM (side-effect-only component)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/pricing']}>
        <DocumentTitle />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });
});