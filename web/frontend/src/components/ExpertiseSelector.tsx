import { motionTransition, prefersReducedMotion } from '../lib/motion';
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
  const chipTransition = reducedMotion
    ? 'none'
    : motionTransition('border-color, background, color', 150);
  const domainId = 'expertise-domain-input';

  return (
    <div
      style={{
        background: '#FAF7F2',
        borderRadius: 6,
        border: '0.5px solid #E0D5C5',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <span
        id="expertise-level-label"
        style={{
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#A89070',
          whiteSpace: 'nowrap',
        }}
      >
        Your background
      </span>
      <div
        role="radiogroup"
        aria-labelledby="expertise-level-label"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
      >
        {EXPERTISE_LEVELS.map(({ id, label }) => {
          const sel = normalized === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={sel}
              disabled={disabled}
              onClick={() => onChange(id, domainForExpertiseLevel(id, domain))}
              style={{
                background: sel ? '#C4956A' : 'transparent',
                border: `0.5px solid ${sel ? '#C4956A' : '#D4C4B0'}`,
                color: sel ? '#FAF7F2' : '#8C7355',
                fontSize: 11,
                borderRadius: 12,
                padding: '4px 12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: chipTransition,
              }}
              onMouseEnter={(e) => {
                if (disabled || sel || reducedMotion) return;
                e.currentTarget.style.borderColor = '#C4956A';
              }}
              onMouseLeave={(e) => {
                if (!sel) e.currentTarget.style.borderColor = '#D4C4B0';
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {showDomain ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <label
            htmlFor={domainId}
            style={{
              fontSize: 10,
              color: '#A89070',
              letterSpacing: '0.04em',
            }}
          >
            Domain (optional)
          </label>
          <input
            id={domainId}
            type="text"
            value={domain}
            disabled={disabled}
            onChange={(e) => onChange(normalized, e.target.value)}
            placeholder={expertiseDomainPlaceholder(normalized)}
            autoComplete="off"
            maxLength={80}
            style={{
              border: 'none',
              borderBottom: '0.5px solid #D4C4B0',
              background: 'transparent',
              fontSize: 12,
              fontFamily: 'Georgia, serif',
              width: 220,
              maxWidth: '100%',
              outline: 'none',
              color: '#2C1810',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
