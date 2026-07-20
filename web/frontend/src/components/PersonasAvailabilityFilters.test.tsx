/**
 * Tests for the PersonasAvailabilityFilters pill row.
 *
 * Used twice in the product:
 *   - default variant on PersonasPage (the library): 14px font, 14px mb
 *   - compact variant inside the slot-swap dialog: 11px font, 12px mb
 *
 * The component is purely controlled (parent owns value + onChange).
 * Drift here would be visible immediately (active pill loses its modifier,
 * clicks stop calling onChange, aria-pressed desyncs from value) but the
 * visual symptom only shows on real usage — these tests pin the contract.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PersonasAvailabilityFilters } from './PersonasAvailabilityFilters';

const options = [
  { value: 'all', label: 'All' },
  { value: 'unlocked', label: 'Unlocked' },
  { value: 'locked', label: 'Locked' },
  { value: 'on_panel', label: 'On panel' },
] as const;

describe('PersonasAvailabilityFilters', () => {
  it('renders all options as buttons with BEM pill class', () => {
    render(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={() => {}}
        ariaLabel="Availability"
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b.className).toContain('personas-availability__pill');
      // None of the inactive ones should carry the --active modifier
      if (b.getAttribute('aria-pressed') !== 'true') {
        expect(b.className).not.toContain('personas-availability__pill--active');
      }
    }
  });

  it('marks the active option with aria-pressed=true and the --active BEM class', () => {
    render(
      <PersonasAvailabilityFilters
        options={options}
        value="locked"
        onChange={() => {}}
        ariaLabel="Availability"
      />,
    );
    const active = screen.getByRole('button', { name: 'Locked' });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.className).toContain('personas-availability__pill--active');
    const inactive = screen.getByRole('button', { name: 'All' });
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
    expect(inactive.className).not.toContain('personas-availability__pill--active');
  });

  it('calls onChange with the option value when a pill is clicked', () => {
    const onChange = vi.fn();
    render(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={onChange}
        ariaLabel="Availability"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlocked' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('unlocked');
  });

  it('re-renders the active pill when the value prop changes', () => {
    const { rerender } = render(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={() => {}}
        ariaLabel="Availability"
      />,
    );
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');

    rerender(
      <PersonasAvailabilityFilters
        options={options}
        value="on_panel"
        onChange={() => {}}
        ariaLabel="Availability"
      />,
    );
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'On panel' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('wraps the pill row in a role=group with the supplied aria-label', () => {
    render(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={() => {}}
        ariaLabel="Library availability filter"
      />,
    );
    const group = screen.getByRole('group', { name: 'Library availability filter' });
    expect(group.className).toContain('personas-availability');
  });

  it('applies the --compact BEM modifier only when variant=compact', () => {
    const { rerender } = render(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={() => {}}
        ariaLabel="Availability"
      />,
    );
    expect(screen.getByRole('group').className).not.toContain('personas-availability--compact');

    rerender(
      <PersonasAvailabilityFilters
        options={options}
        value="all"
        onChange={() => {}}
        ariaLabel="Availability"
        variant="compact"
      />,
    );
    expect(screen.getByRole('group').className).toContain('personas-availability--compact');
  });

  it('renders exactly the supplied options, no more, no less', () => {
    const twoOptions = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ] as const;
    render(
      <PersonasAvailabilityFilters
        options={twoOptions}
        value="a"
        onChange={() => {}}
        ariaLabel="Two options"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Gamma' })).toBeNull();
  });
});
