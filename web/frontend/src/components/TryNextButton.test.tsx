import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TryNextButton } from './TryNextButton';

describe('TryNextButton', () => {
  it('renders without crashing when localStorage has no data', () => {
    // The component reads favorites + recent tools from
    // localStorage in a useEffect. In the test environment
    // localStorage is available but empty, so the picker
    // resolves to a null pick. The component must handle this
    // gracefully and render null without throwing.
    const { container } = render(
      <MemoryRouter>
        <TryNextButton />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('renders without crashing with a custom label', () => {
    const { container } = render(
      <MemoryRouter>
        <TryNextButton label="Try something" />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('renders without crashing with a custom date', () => {
    const { container } = render(
      <MemoryRouter>
        <TryNextButton date={new Date(2026, 6, 25)} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
