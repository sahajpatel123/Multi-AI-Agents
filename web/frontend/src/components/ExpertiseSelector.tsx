import { useId } from 'react';
import { prefersReducedMotion } from '../lib/motion';
import {
  domainForExpertiseLevel,
  expertiseDomainPlaceholder,
  EXPERTISE_LEVELS,
  normalizeExpertiseLevel,
  shouldShowExpertiseDomain,
} from '../lib/expertiseSelector';

type ExpertiseSelectorProps = {
  level: string;
  domain: string;
  onChange: (level: string, domain: string) => void;
  disabled?: boolean;
};

export function ExpertiseSelector({
  level,
  domain,
  onChange,
  disabled = false,
}: ExpertiseSelectorProps) {
  const normalized = normalizeExpertiseLevel(level);
  const showDomain = shouldShowExpertiseDomain(normalized);
  const reducedMotion = prefersReducedMotion();
  const labelId = useId();
  const domainId = useId();

  return (
    <div
      className={[
        'expertise-selector',
        disabled ? 'expertise-selector--disabled' : '',
        reducedMotion ? 'expertise-selector--static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span id={labelId} className="expertise-selector__label">
        Your background
      </span>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="expertise-selector__chips"
      >
        {EXPERTISE_LEVELS.map(({ id, label }) => {
          const selected = normalized === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              className={[
                'expertise-selector__chip',
                selected ? 'expertise-selector__chip--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(id, domainForExpertiseLevel(id, domain))}
            >
              {label}
            </button>
          );
        })}
      </div>

      {showDomain ? (
        <div className="expertise-selector__domain">
          <label htmlFor={domainId} className="expertise-selector__domain-label">
            Domain <span className="expertise-selector__optional">(optional)</span>
          </label>
          <input
            id={domainId}
            type="text"
            className="expertise-selector__domain-input"
            value={domain}
            disabled={disabled}
            onChange={(e) => onChange(normalized, e.target.value)}
            placeholder={expertiseDomainPlaceholder(normalized)}
            autoComplete="off"
            maxLength={80}
          />
        </div>
      ) : null}
    </div>
  );
}
