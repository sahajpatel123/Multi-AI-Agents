import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PersonasSearchInput } from './PersonasSearchInput';

describe('PersonasSearchInput', () => {
  it('renders the input with the right placeholder + aria-label', () => {
    render(
      <PersonasSearchInput
        value=""
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search minds…"
        ariaLabel="Search persona library"
        clearAriaLabel="Clear persona search"
      />,
    );
    const input = screen.getByLabelText('Search persona library');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Search minds…');
    expect(input).toHaveAttribute('type', 'search');
  });

  it('hides the clear button when value is empty', () => {
    render(
      <PersonasSearchInput
        value=""
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear search"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('shows the clear button when value is non-empty', () => {
    render(
      <PersonasSearchInput
        value="analyst"
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear persona search"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Clear persona search' }),
    ).toBeInTheDocument();
  });

  it('calls onChange with the typed value', () => {
    const onChange = vi.fn();
    render(
      <PersonasSearchInput
        value=""
        onChange={onChange}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear"
      />,
    );
    const input = screen.getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'analyst' } });
    expect(onChange).toHaveBeenCalledWith('analyst');
  });

  it('calls onClear and re-focuses the input when the clear button is clicked', () => {
    const onClear = vi.fn();
    function Harness() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <>
          <PersonasSearchInput
            inputRef={ref}
            value="analyst"
            onChange={() => {}}
            onClear={onClear}
            placeholder="Search"
            ariaLabel="Search"
            clearAriaLabel="Clear persona search"
          />
          <button type="button" data-testid="other">other</button>
        </>
      );
    }
    render(<Harness />);
    const clearButton = screen.getByRole('button', { name: 'Clear persona search' });
    clearButton.click();
    expect(onClear).toHaveBeenCalledTimes(1);
    // After clear, the input is still in the document (it's a controlled
    // component) and should have focus because the clear handler re-focuses.
    const input = screen.getByLabelText('Search');
    expect(document.activeElement).toBe(input);
  });

  it('applies the .personas-search class by default (library variant)', () => {
    const { container } = render(
      <PersonasSearchInput
        value=""
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear"
      />,
    );
    const wrapper = container.querySelector('.personas-search');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.classList.contains('personas-search--swap')).toBe(false);
  });

  it('applies the .personas-search--swap class when variant="swap"', () => {
    const { container } = render(
      <PersonasSearchInput
        value=""
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear"
        variant="swap"
      />,
    );
    const wrapper = container.querySelector('.personas-search');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.classList.contains('personas-search--swap')).toBe(true);
  });

  it('renders the input with the .personas-search__input BEM class', () => {
    const { container } = render(
      <PersonasSearchInput
        value=""
        onChange={() => {}}
        onClear={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        clearAriaLabel="Clear"
      />,
    );
    expect(container.querySelector('.personas-search__input')).toBeTruthy();
  });
});
