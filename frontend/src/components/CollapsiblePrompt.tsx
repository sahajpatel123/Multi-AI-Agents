import { useEffect, useState, type CSSProperties } from 'react';

const TEXT_STYLE: CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: 15,
  fontStyle: 'italic',
  color: '#4A3728',
  lineHeight: 1.65,
  textAlign: 'center',
  transition: 'all 0.3s ease',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const HINT_STYLE: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  marginTop: 6,
  fontSize: 11,
  color: '#C4A882',
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  fontFamily: 'Georgia, serif',
  fontStyle: 'normal',
};

type CollapsiblePromptProps = {
  text: string;
};

export function CollapsiblePrompt({ text }: CollapsiblePromptProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 120;

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  const outer: CSSProperties = {
    maxWidth: 680,
    margin: '0 auto 32px auto',
    ...(isLong ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
  };

  if (!isLong) {
    return (
      <div style={outer}>
        <p style={TEXT_STYLE}>{text}</p>
      </div>
    );
  }

  return (
    <div
      style={outer}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
    >
      <div
        style={{
          maxHeight: expanded ? '1000px' : '3.6em',
          overflow: 'hidden',
          transition: 'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <p style={TEXT_STYLE}>{text}</p>
      </div>
      <span style={HINT_STYLE}>{expanded ? 'Collapse ↑' : 'Read full prompt ↓'}</span>
    </div>
  );
}
