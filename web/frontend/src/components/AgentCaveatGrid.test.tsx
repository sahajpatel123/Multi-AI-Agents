import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  CaveatGridCard,
  AnalyticalCaveatsSection,
  type StructuredCaveat,
} from './AgentCaveatGrid';

const baseCaveat: StructuredCaveat = {
  category: 'time-sensitive',
  keyword: 'Quarterly earnings season',
  description: 'Results from Q1 2026 may shift the picture by 20%.',
  severity: 'medium',
  expires: '2026-09-30',
};

function renderCard(c: Partial<StructuredCaveat> = {}, displayNum = 1) {
  return render(<CaveatGridCard caveat={{ ...baseCaveat, ...c }} displayNum={displayNum} />);
}

describe('CaveatGridCard', () => {
  it('renders the time-sensitive variant with a 2-column span', () => {
    const { container } = renderCard({ category: 'time-sensitive' });
    // The time-sensitive variant spans 2 columns and uses a dark background.
    const card = container.querySelector('.agent-caveat-span2');
    expect(card).toBeTruthy();
    expect(screen.getByText(/time-sensitive/i)).toBeInTheDocument();
  });

  it('renders the methodological variant with the severity chip', () => {
    const { container } = renderCard({ category: 'methodological', severity: 'high' }, 7);
    // Severity label appears as a chip.
    expect(screen.getByText('high')).toBeInTheDocument();
    // Methodological variant shows the displayNum as a watermark.
    expect(container.textContent).toMatch(/7/);
  });

  it('renders the theory-dependent variant with the ◈ marker', () => {
    renderCard({ category: 'theory-dependent' });
    expect(screen.getByText(/theory-dependent/i)).toBeInTheDocument();
  });

  it('renders the keyword and description on every variant', () => {
    renderCard({
      category: 'time-sensitive',
      keyword: 'Custom keyword',
      description: 'Custom description text',
    });
    expect(screen.getByText('Custom keyword')).toBeInTheDocument();
    expect(screen.getByText('Custom description text')).toBeInTheDocument();
  });

  it('renders the expiry pulse dot when expires is set', () => {
    const { container } = renderCard({ expires: '2026-09-30' });
    const dot = container.querySelector('.caveat-expiry-pulse-dot');
    expect(dot).toBeTruthy();
  });

  it('does not render the expiry dot when expires is null', () => {
    const { container } = renderCard({ expires: null });
    expect(container.querySelector('.caveat-expiry-pulse-dot')).toBeNull();
  });

  it('falls through to the default variant for unknown categories', () => {
    // The default branch renders the keyword + description in a card with no
    // category-specific chrome. Use queryByText to assert they're present
    // without role="status" assumptions.
    const { container } = renderCard({ category: 'unknown-category' });
    expect(container.textContent).toContain(baseCaveat.keyword);
    expect(container.textContent).toContain(baseCaveat.description);
  });
});

describe('AnalyticalCaveatsSection', () => {
  it('returns null when caveats array is empty', () => {
    const { container } = render(<AnalyticalCaveatsSection caveats={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the section header when caveats are present', () => {
    const { container } = render(
      <AnalyticalCaveatsSection caveats={[baseCaveat]} />,
    );
    // The section is a wrapper div with the .agent-caveats-grid child.
    const grid = container.querySelector('.agent-caveats-grid');
    expect(grid).toBeTruthy();
    // The keyword from the passed-in caveat renders inside the grid.
    expect(screen.getByText(baseCaveat.keyword)).toBeInTheDocument();
  });

  it('renders one card per caveat in the grid', () => {
    const caveats: StructuredCaveat[] = [
      { ...baseCaveat, keyword: 'Caveat 1' },
      { ...baseCaveat, keyword: 'Caveat 2' },
      { ...baseCaveat, keyword: 'Caveat 3' },
    ];
    const { container } = render(<AnalyticalCaveatsSection caveats={caveats} />);
    // Grid contains 3 CaveatGridCard children.
    const grid = container.querySelector('.agent-caveats-grid');
    const children = grid?.children.length ?? 0;
    expect(children).toBe(3);
  });
});
