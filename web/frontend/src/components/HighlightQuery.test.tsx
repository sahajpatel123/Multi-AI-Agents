import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightQuery } from './HighlightQuery';

describe('HighlightQuery', () => {
  it('renders plain text when query is empty', () => {
    const { container } = render(<HighlightQuery text="Hello world" query="" />);
    expect(container.textContent).toBe('Hello world');
    expect(container.querySelector('mark')).toBeNull();
  });

  it('renders plain text when query is whitespace-only', () => {
    const { container } = render(<HighlightQuery text="Hello world" query="   " />);
    expect(container.querySelector('mark')).toBeNull();
  });

  it('wraps matches in <mark>', () => {
    const { container } = render(
      <HighlightQuery text="quantum computing" query="quantum" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('quantum');
  });

  it('highlights multiple occurrences with case-insensitive default', () => {
    const { container } = render(
      <HighlightQuery text="Quantum and quantum both match" query="quantum" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
  });

  it('preserves original casing inside <mark>', () => {
    const { container } = render(
      <HighlightQuery text="Quantum Computing" query="quantum" />,
    );
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('Quantum');
  });

  it('returns null when text is empty', () => {
    const { container } = render(<HighlightQuery text="" query="x" />);
    expect(container.firstChild).toBeNull();
  });

  it('caseSensitive=true requires exact case', () => {
    const { container } = render(
      <HighlightQuery text="Quantum Computing" query="quantum" caseSensitive />,
    );
    expect(container.querySelector('mark')).toBeNull();

    const matched = render(
      <HighlightQuery text="Quantum Computing" query="Quantum" caseSensitive />,
    );
    expect(matched.container.querySelector('mark')).not.toBeNull();
  });

  it('multiTerm=true highlights each whitespace-separated term', () => {
    const { container } = render(
      <HighlightQuery
        text="quantum computing is fun"
        query="quantum fun"
        multiTerm
      />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe('quantum');
    expect(marks[1].textContent).toBe('fun');
  });

  it('escapes regex metacharacters in needles', () => {
    // '100%' must match the literal substring — the % is a regex
    // wildcard otherwise and would silently highlight every char.
    const { container } = render(
      <HighlightQuery text="100% effort sprint" query="100%" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe('100%');
  });

  it('combines caseSensitive + multiTerm', () => {
    // In case-sensitive multi-term mode, every whitespace-separated
    // term must match the source exactly (both case and content).
    // 'quantum Quantum' against 'Quantum and quantum' matches BOTH
    // because each needle has a case-exact occurrence.
    const { container } = render(
      <HighlightQuery
        text="Quantum and quantum"
        query="quantum Quantum"
        caseSensitive
        multiTerm
      />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toBe('Quantum');
    expect(marks[1].textContent).toBe('quantum');
  });

  it('caseSensitive + multiTerm skips needles with no case match', () => {
    // Neither needle matches when only lowercase is in the source.
    const { container } = render(
      <HighlightQuery
        text="only lowercase"
        query="Quantum Quantum"
        caseSensitive
        multiTerm
      />,
    );
    expect(container.querySelector('mark')).toBeNull();
  });

  it('applies highlight-query mark chrome class', () => {
    const { container } = render(
      <HighlightQuery text="quantum computing" query="quantum" />,
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveClass('highlight-query-mark');
    expect(container.querySelector('.highlight-query')).not.toBeNull();
  });

  it('accepts custom markClassName', () => {
    const { container } = render(
      <HighlightQuery
        text="quantum computing"
        query="quantum"
        markClassName="custom-mark"
      />,
    );
    expect(container.querySelector('mark')).toHaveClass('highlight-query-mark');
    expect(container.querySelector('mark')).toHaveClass('custom-mark');
  });
});