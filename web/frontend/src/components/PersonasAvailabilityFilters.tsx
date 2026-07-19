export interface PersonasAvailabilityOption<T extends string> {
  value: T;
  label: string;
}

export interface PersonasAvailabilityFiltersProps<T extends string> {
  /** All options rendered as pills. */
  options: ReadonlyArray<PersonasAvailabilityOption<T>>;
  /** Currently selected option. */
  value: T;
  /** Called when a pill is clicked. */
  onChange: (next: T) => void;
  /** Accessible label for the pill group. */
  ariaLabel: string;
  /** `default` (used by library): 14px fontSize, 14px margin-bottom. `compact` (swap modal): 11px fontSize, 12px margin-bottom. */
  variant?: 'default' | 'compact';
}

/**
 * Horizontal row of availability filter pills (All / Unlocked / Locked / On panel).
 *
 * BEM classes live in `styles/personas-page.css` under `.personas-availability*`.
 * The `variant` prop toggles sizing between the library and the swap modal.
 */
export function PersonasAvailabilityFilters<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'default',
}: PersonasAvailabilityFiltersProps<T>) {
  const variantClass = variant === 'compact' ? 'personas-availability--compact' : '';
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`personas-availability ${variantClass}`.trim()}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const className = [
          'personas-availability__pill',
          selected ? 'personas-availability__pill--active' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={className}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
