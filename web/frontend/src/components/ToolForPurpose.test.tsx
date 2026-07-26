import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToolForPurpose } from './ToolForPurpose';
import { matchToolForPurpose } from '../data/personaPlayground';

describe('ToolForPurpose', () => {
  it('renders the input with the default heading and placeholder', () => {
    render(
      <MemoryRouter>
        <ToolForPurpose />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(/Search tools by purpose/);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute(
      'placeholder',
      'e.g. "compare two", "fastest", "myself"',
    );
  });

  it('honors a custom heading and placeholder', () => {
    render(
      <MemoryRouter>
        <ToolForPurpose
          heading="Find me a tool"
          placeholder="type a word"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Find me a tool/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Search tools by purpose/)).toHaveAttribute(
      'placeholder',
      'type a word',
    );
  });

  it('does not show a match link when input is empty', () => {
    render(
      <MemoryRouter>
        <ToolForPurpose />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a match link when the query matches a catalog entry', () => {
    render(
      <MemoryRouter>
        <ToolForPurpose />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(/Search tools by purpose/);
    fireEvent.change(input, { target: { value: 'dilemma' } });
    const links = screen.queryAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    const href = links[0]?.getAttribute('href') ?? '';
    expect(href.startsWith('/persona-')).toBe(true);
  });

  it('shows a clear button when input has content and clears on click', () => {
    render(
      <MemoryRouter>
        <ToolForPurpose />
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(/Search tools by purpose/);
    fireEvent.change(input, { target: { value: 'trivia' } });
    const clearBtn = screen.getByLabelText(/Clear search/);
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(input).toHaveValue('');
  });
});

describe('matchToolForPurpose (re-exported via ToolForPurpose usage)', () => {
  it('returns null for an empty query', () => {
    expect(matchToolForPurpose('')).toBeNull();
  });

  it('returns null for short-word-only queries (filtered out)', () => {
    expect(matchToolForPurpose('a an to')).toBeNull();
  });

  it('returns an entry for a real keyword', () => {
    expect(matchToolForPurpose('trivia')?.path).toBe('/persona-trivia');
  });
});
