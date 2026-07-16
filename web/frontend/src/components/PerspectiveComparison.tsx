import { useMemo } from 'react';
import { ScoredAgent } from '../types';

interface PerspectiveComparisonProps {
  responses: ScoredAgent[];
  onClose: () => void;
}

/**
 * Shows key thematic differences across agents' answers.
 * Uses simple text analysis to highlight divergent thinking patterns.
 */
export function PerspectiveComparison({ responses, onClose }: PerspectiveComparisonProps) {
  const themes = useMemo(() => {
    if (responses.length === 0) return [];

    const allOneLiners = responses.map((r) => r.response.one_liner || '').filter(Boolean);
    if (allOneLiners.length === 0) return [];

    // Extract key terms from each answer (simple approach)
    const extractKeywords = (text: string): string[] => {
      const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      // Filter out common words
      const stopWords = new Set(['this', 'that', 'have', 'with', 'from', 'your', 'they', 'what', 'when', 'will', 'would']);
      return words.filter((w) => !stopWords.has(w)).slice(0, 5);
    };

    return responses.map((r) => ({
      agentId: r.response.agent_id,
      name: (r.response.one_liner || '').substring(0, 60) + '...',
      keywords: extractKeywords(r.response.one_liner || r.response.verdict || ''),
      score: r.score,
      confidence: r.response.confidence,
    }));
  }, [responses]);

  if (themes.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 23, 20, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FAF7F2',
          borderRadius: 14,
          padding: 24,
          maxWidth: 560,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 48px rgba(26, 23, 20, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#1A1714' }}>
            Perspective comparison
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: '#A89070',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {themes.map((t) => (
            <div
              key={t.agentId}
              style={{
                background: '#FFFFFF',
                border: '0.5px solid #E0D8D0',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C4956A',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#2C1810' }}>
                  Agent {t.agentId.split('_')[1]}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A89070' }}>
                  IQ: {t.confidence}/100
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#4A3728', marginBottom: 8 }}>
                {t.keywords.length > 0 ? t.keywords.map((k, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      background: '#F5F0E8',
                      borderRadius: 4,
                      padding: '2px 6px',
                      marginRight: 4,
                      marginBottom: 4,
                      fontSize: 11,
                      color: '#8A7355',
                    }}
                  >
                    {k}
                  </span>
                )) : <span style={{ color: '#A89070', fontStyle: 'italic' }}>No key terms</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}