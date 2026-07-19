import { type RefObject } from 'react';

export interface PersonasSearchInputProps {
  /** Ref forwarded to the underlying <input>. Caller owns focus/select calls. */
  inputRef?: RefObject<HTMLInputElement>;
  /** Controlled value. */
  value: string;
  /** Called when the user types. */
  onChange: (next: string) => void;
  /** Placeholder text. */
  placeholder: string;
  /** Accessible label. */
  ariaLabel: string;
  /** Reset the value to empty and re-focus the input. */
  onClear: () => void;
  /** Aria label for the clear button (visible only when value is non-empty). */
  clearAriaLabel: string;
  /** `library` (default): cream `#faf7f4` background. `swap`: pure white. */
  variant?: 'library' | 'swap';
}

/**
 * Search input + inline clear button used by PersonasPage.
 *
 * BEM classes live in `styles/personas-page.css` under `.personas-search*`.
 * `variant="swap"` toggles `--swap` for the white background the swap
 * modal uses against its tinted backdrop.
 */
export function PersonasSearchInput({
  inputRef,
  value,
  onChange,
  placeholder,
  ariaLabel,
  onClear,
  clearAriaLabel,
  variant = 'library',
}: PersonasSearchInputProps) {
  const variantClass = variant === 'swap' ? 'personas-search--swap' : '';
  return (
    <div className={`personas-search ${variantClass}`.trim()}>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        className="personas-search__input"
      />
      {value ? (
        <button
          type="button"
          aria-label={clearAriaLabel}
          onClick={() => {
            onClear();
            inputRef?.current?.focus();
          }}
          className="personas-search__clear"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
