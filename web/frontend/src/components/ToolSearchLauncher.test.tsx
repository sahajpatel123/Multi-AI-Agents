import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToolSearchLauncher } from './ToolSearchLauncher';

describe('ToolSearchLauncher', () => {
  it('renders the default launcher button', () => {
    render(
      <MemoryRouter>
        <ToolSearchLauncher />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Open the command palette/i }))
      .toBeInTheDocument();
  });

  it('opens the palette when the launcher button is clicked', () => {
    render(
      <MemoryRouter>
        <ToolSearchLauncher />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Open the command palette/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('honors a custom label', () => {
    render(
      <MemoryRouter>
        <ToolSearchLauncher label="Quick launch" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Quick launch/i }))
      .toBeInTheDocument();
  });
});
