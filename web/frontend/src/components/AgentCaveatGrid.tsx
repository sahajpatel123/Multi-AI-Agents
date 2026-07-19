import { Clock, Layers, Search } from 'lucide-react';

export type StructuredCaveat = {
  category: string;
  keyword: string;
  description: string;
  severity: string;
  expires: string | null;
};

function methodologicalSeverityStyle(sev: string): { bg: string; border: string; color: string } {
  if (sev === 'high') return { bg: '#FCF0EE', border: '#F0997B', color: '#993C1D' };
  if (sev === 'low') return { bg: '#F5F5F0', border: '#D3D1C7', color: '#5F5E5A' };
  return { bg: '#FDF6EC', border: '#E8C87A', color: '#854F0B' };
}

export function CaveatGridCard({ caveat: c, displayNum }: { caveat: StructuredCaveat; displayNum: number }) {
  const kind = c.category;

  if (kind === 'time-sensitive') {
    return (
      <div
        className="agent-caveat-span2"
        style={{
          gridColumn: 'span 2',
          position: 'relative',
          overflow: 'hidden',
          background: '#F3F0E7',
          borderRadius: 10,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(196,149,106,0.08)',
            top: -40,
            right: -20,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: 'rgba(196,149,106,0.08)',
            bottom: -28,
            left: -24,
          }}
        />
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: '1.5px solid rgba(196,149,106,0.4)',
            background: 'rgba(196,149,106,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Clock width={22} height={22} color="#F0B84E" strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#F0B84E', marginBottom: 4 }}>⏳ Time-sensitive</div>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#E8D5BE', marginBottom: 6 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#8C7355', lineHeight: 1.45 }}>{c.description}</div>
          {c.expires ? (
            <div
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(196,149,106,0.2)',
                border: '0.5px solid rgba(196,149,106,0.4)',
                borderRadius: 8,
                padding: '3px 10px',
              }}
            >
              <span
                className="caveat-expiry-pulse-dot"
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0B84E', flexShrink: 0 }}
              />
              <span style={{ fontSize: 10, color: '#F0B84E' }}>
                Expires {c.expires} · Perishable
              </span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === 'methodological') {
    const sb = methodologicalSeverityStyle(c.severity);
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#FDF0E8',
          border: '0.5px solid #E8C8A8',
          borderRadius: 10,
          padding: '16px 14px 14px 20px',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 4,
            height: '100%',
            background:
              'repeating-linear-gradient(180deg, #F0B84E 0, #F0B84E 8px, transparent 8px, transparent 14px)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 10,
            fontSize: 48,
            fontWeight: 500,
            color: '#F0B84E',
            opacity: 0.12,
            lineHeight: 1,
          }}
        >
          {displayNum}
        </span>
        <div style={{ paddingLeft: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#F0B84E', marginBottom: 4 }}>⚠ Methodological</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#F3F0E7', marginBottom: 6 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#6B5040', lineHeight: 1.45, marginBottom: 10 }}>{c.description}</div>
          <span
            style={{
              display: 'inline-block',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '3px 8px',
              borderRadius: 6,
              background: sb.bg,
              border: `0.5px solid ${sb.border}`,
              color: sb.color,
            }}
          >
            {c.severity}
          </span>
        </div>
      </div>
    );
  }

  if (kind === 'theory-dependent') {
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#EEEDFE',
          border: '0.5px solid #AFA9EC',
          borderRadius: 10,
          padding: '16px 14px 14px 16px',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            fontSize: 64,
            color: '#534AB7',
            opacity: 0.12,
            fontFamily: 'var(--vp-font-sans)',
            lineHeight: 1,
          }}
        >
          &ldquo;
        </span>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#534AB7', marginBottom: 4 }}>◈ Theory-dependent</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#26215C', marginBottom: 6 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#3C3489', opacity: 0.8, lineHeight: 1.45, marginBottom: 8 }}>
            {c.description}
          </div>
          <span
            style={{
              display: 'inline-block',
              background: '#CECBF6',
              color: '#26215C',
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            Multiple interpretations
          </span>
        </div>
      </div>
    );
  }

  if (kind === 'completeness') {
    return (
      <div
        className="agent-caveat-span2"
        style={{
          gridColumn: 'span 2',
          position: 'relative',
          overflow: 'hidden',
          background: '#EAF3DE',
          border: '0.5px solid #97C459',
          borderRadius: 10,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            opacity: 0.4,
            background:
              'repeating-linear-gradient(180deg, #639922 0, #639922 10px, transparent 10px, transparent 16px)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 28,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 42,
            fontWeight: 500,
            color: '#639922',
            opacity: 0.15,
            lineHeight: 1,
          }}
        >
          {displayNum}
        </span>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: 'rgba(99,153,34,0.15)',
            border: '0.5px solid #97C459',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Search width={18} height={18} color="#639922" strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#639922', marginBottom: 4 }}>◇ Completeness</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#F3F0E7', marginBottom: 4 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#4A5C28', lineHeight: 1.45, opacity: 0.9 }}>{c.description}</div>
        </div>
      </div>
    );
  }

  if (kind === 'precision') {
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#FBF0F0',
          border: '0.5px solid #E0A8A8',
          borderRadius: 10,
          padding: '14px 12px 16px 14px',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -16,
            right: -12,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(216,90,48,0.06)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 4,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(216,90,48,0.08)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 6,
            right: 10,
            fontSize: 32,
            fontWeight: 500,
            color: '#D85A30',
            opacity: 0.14,
            lineHeight: 1,
          }}
        >
          {displayNum}
        </span>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#D85A30', marginBottom: 4 }}>◎ Precision</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#F3F0E7', marginBottom: 6 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#712B13', opacity: 0.75, lineHeight: 1.45 }}>{c.description}</div>
        </div>
      </div>
    );
  }

  if (kind === 'aesthetic') {
    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          border: '0.5px solid #D3D1C7',
          borderRadius: 10,
          padding: '14px 12px 14px 14px',
          background:
            '#F5F5F0 repeating-linear-gradient(45deg, rgba(180,178,169,0.15) 0, rgba(180,178,169,0.15) 1px, transparent 1px, transparent 8px)',
          backgroundSize: '10px 10px',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, color: '#888780', marginBottom: 4 }}>◇ Aesthetic</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A', marginBottom: 6 }}>{c.keyword}</div>
          <div style={{ fontSize: 11, color: '#5F5E5A', lineHeight: 1.45 }}>{c.description}</div>
        </div>
      </div>
    );
  }

  /* scoring + fallback */
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#FAF7F2',
        border: '0.5px solid #E0D5C5',
        borderLeft: '3px solid #8C7355',
        borderRadius: 10,
        padding: '14px 12px 14px 14px',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          fontSize: 22,
          fontWeight: 500,
          color: '#8C7355',
          opacity: 0.2,
          lineHeight: 1,
        }}
      >
        {displayNum}
      </span>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 9, color: '#8C7355', marginBottom: 4 }}>▣ Scoring</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#F3F0E7', marginBottom: 6 }}>{c.keyword}</div>
        <div style={{ fontSize: 11, color: '#A0A39A', lineHeight: 1.45 }}>{c.description}</div>
      </div>
    </div>
  );
}

export function AnalyticalCaveatsSection({ caveats }: { caveats: StructuredCaveat[] }) {
  if (!caveats.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`
        @keyframes caveatBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .caveat-expiry-pulse-dot {
          animation: caveatBlink 1.5s ease-in-out infinite;
        }
        @media (max-width: 768px) {
          .agent-caveats-grid {
            grid-template-columns: 1fr !important;
          }
          .agent-caveat-span2 {
            grid-column: span 1 !important;
          }
        }
      `}</style>
      <div
        style={{
          background: '#F3F0E7',
          borderRadius: '12px 12px 0 0',
          padding: '13px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Layers width={16} height={16} color="#F0B84E" strokeWidth={1.5} opacity={0.9} aria-hidden />
          <span
            style={{
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#F0B84E',
            }}
          >
            Analytical Caveats
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            background: 'rgba(196,149,106,0.2)',
            color: '#F0B84E',
            padding: '2px 8px',
            borderRadius: 8,
            border: '0.5px solid rgba(196,149,106,0.3)',
          }}
        >
          {caveats.length} found
        </span>
      </div>
      <div
        className="agent-caveats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          padding: 12,
          background: '#F0EBE3',
          borderRadius: '0 0 12px 12px',
          border: '0.5px solid #E0D5C5',
          borderTop: 'none',
        }}
      >
        {caveats.map((caveat, i) => (
          <CaveatGridCard key={`${caveat.category}-${i}-${caveat.keyword.slice(0, 12)}`} caveat={caveat} displayNum={i + 1} />
        ))}
      </div>
    </div>
  );
}
