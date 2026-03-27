type ExpertiseSelectorProps = {
  level: string;
  domain: string;
  onChange: (level: string, domain: string) => void;
};

const LEVELS: { id: string; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'curious', label: 'Curious' },
  { id: 'practitioner', label: 'Practitioner' },
  { id: 'expert', label: 'Expert' },
  { id: 'researcher', label: 'Researcher' },
];

export function ExpertiseSelector({ level, domain, onChange }: ExpertiseSelectorProps) {
  const normalized = (level || 'curious').toLowerCase();

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
      }}
    >
      <span
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {LEVELS.map(({ id, label }) => {
          const sel = normalized === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id, id === 'none' ? '' : domain)}
              style={{
                background: sel ? '#C4956A' : 'transparent',
                border: `0.5px solid ${sel ? '#C4956A' : '#D4C4B0'}`,
                color: sel ? '#FAF7F2' : '#8C7355',
                fontSize: 11,
                borderRadius: 12,
                padding: '4px 12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!sel) e.currentTarget.style.borderColor = '#C4956A';
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
      {normalized !== 'none' ? (
        <input
          type="text"
          value={domain}
          onChange={(e) => onChange(normalized, e.target.value)}
          placeholder="e.g. cardiology, ML research..."
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
      ) : null}
    </div>
  );
}
