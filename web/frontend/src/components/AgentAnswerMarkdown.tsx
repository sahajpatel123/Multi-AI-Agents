import { isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import {
  agentAnswerOutlineUseful,
  estimateReadingMinutes,
  extractAgentAnswerHeadings,
  formatAgentAnswerReadingLabel,
  type AgentAnswerHeading,
} from '../lib/agentAnswerOutline';
import { scrollBehavior } from '../lib/motion';

function useNarrow768(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return narrow;
}

function childrenToPlainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToPlainText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return childrenToPlainText(props?.children);
  }
  return '';
}

function normHeading(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function jumpToHeading(id: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  // Help keyboard / SR users land focus without a permanent outline ring restyle.
  if (typeof el.focus === 'function') {
    const prevTabIndex = el.getAttribute('tabindex');
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (prevTabIndex == null) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', prevTabIndex);
  }
}

type AgentAnswerMarkdownProps = {
  markdown: string;
  /** When the first # heading matches this (e.g. task text), render as h2 instead. */
  question?: string;
  emptyMessage?: string;
};

export function AgentAnswerMarkdown({ markdown, question, emptyMessage }: AgentAnswerMarkdownProps) {
  const narrow = useNarrow768();
  const firstH1Ref = useRef(true);
  const headingCursorRef = useRef(0);
  const q = (question || '').trim();
  const [outlineOpen, setOutlineOpen] = useState(true);

  const headings = useMemo(() => extractAgentAnswerHeadings(markdown || ''), [markdown]);
  const readingMeta = useMemo(() => estimateReadingMinutes(markdown || ''), [markdown]);
  const readingLabel = formatAgentAnswerReadingLabel(readingMeta);
  const showOutline = agentAnswerOutlineUseful(headings);

  useEffect(() => {
    firstH1Ref.current = true;
    headingCursorRef.current = 0;
  }, [markdown]);

  // Long answers default outline open; short multi-section stay open too (scannable).
  useEffect(() => {
    setOutlineOpen(true);
  }, [markdown]);

  const fs = {
    h1: narrow ? 18 : 20,
    h2: narrow ? 15 : 16,
    h3: narrow ? 14 : 14,
    p: narrow ? 14 : 15,
    li: narrow ? 13 : 14,
  };

  const takeHeadingId = (): string | undefined => {
    const i = headingCursorRef.current;
    const id = headings[i]?.id;
    if (id) headingCursorRef.current = i + 1;
    return id;
  };

  const headingScrollPad: CSSProperties = {
    scrollMarginTop: 88,
  };

  const components: Components = {
    h1: ({ children }) => {
      const text = childrenToPlainText(children);
      const dup = firstH1Ref.current && q.length > 0 && normHeading(text) === normHeading(q);
      firstH1Ref.current = false;
      const id = takeHeadingId();
      if (dup) {
        return (
          <h2
            id={id}
            style={{
              fontSize: fs.h2,
              fontWeight: 500,
              color: '#2C1810',
              fontFamily: 'Georgia, serif',
              marginTop: '20px',
              marginBottom: '8px',
              lineHeight: '1.4',
              paddingBottom: '5px',
              borderBottom: '0.5px solid #EDE4D8',
              ...headingScrollPad,
            }}
          >
            {children}
          </h2>
        );
      }
      return (
        <h1
          id={id}
          style={{
            fontSize: fs.h1,
            fontWeight: 500,
            color: '#2C1810',
            fontFamily: 'Georgia, serif',
            marginTop: '24px',
            marginBottom: '10px',
            lineHeight: '1.3',
            ...headingScrollPad,
          }}
        >
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      firstH1Ref.current = false;
      const id = takeHeadingId();
      return (
        <h2
          id={id}
          style={{
            fontSize: fs.h2,
            fontWeight: 500,
            color: '#2C1810',
            fontFamily: 'Georgia, serif',
            marginTop: '20px',
            marginBottom: '8px',
            lineHeight: '1.4',
            paddingBottom: '5px',
            borderBottom: '0.5px solid #EDE4D8',
            ...headingScrollPad,
          }}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const id = takeHeadingId();
      return (
        <h3
          id={id}
          style={{
            fontSize: fs.h3,
            fontWeight: 500,
            color: '#4A3728',
            fontFamily: 'Georgia, serif',
            marginTop: '16px',
            marginBottom: '6px',
            ...headingScrollPad,
          }}
        >
          {children}
        </h3>
      );
    },
    p: ({ children }) => (
      <p
        style={{
          fontSize: fs.p,
          color: '#2C1810',
          fontFamily: 'Georgia, serif',
          lineHeight: '1.82',
          marginBottom: '14px',
        }}
      >
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul
        style={{
          paddingLeft: '20px',
          marginBottom: '14px',
        }}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        style={{
          paddingLeft: '20px',
          marginBottom: '14px',
        }}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li
        style={{
          fontSize: fs.li,
          color: '#2C1810',
          fontFamily: 'Georgia, serif',
          lineHeight: '1.7',
          marginBottom: '5px',
        }}
      >
        {children}
      </li>
    ),
    strong: ({ children }) => (
      <strong
        style={{
          fontWeight: 600,
          color: '#2C1810',
        }}
      >
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em
        style={{
          fontStyle: 'italic',
          color: '#6B5040',
        }}
      >
        {children}
      </em>
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '3px solid #C4956A',
          paddingLeft: '14px',
          margin: '16px 0',
          color: '#6B5040',
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre
        style={{
          background: '#F5EFE6',
          border: '0.5px solid #E0D5C5',
          borderRadius: '8px',
          padding: '14px 16px',
          overflowX: 'auto',
          margin: '14px 0',
        }}
      >
        {children}
      </pre>
    ),
    code: ({ className, children }) => {
      const isBlock = Boolean(className?.includes('language-'));
      if (isBlock) {
        return (
          <code
            className={className}
            style={{
              fontSize: '13px',
              color: '#2C1810',
              fontFamily: 'monospace',
            }}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          style={{
            background: '#F0E8DC',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#4A3728',
            fontFamily: 'monospace',
          }}
        >
          {children}
        </code>
      );
    },
    hr: () => (
      <hr
        style={{
          border: 'none',
          borderTop: '0.5px solid #EDE4D8',
          margin: '20px 0',
        }}
      />
    ),
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            fontFamily: 'Georgia, serif',
          }}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th
        style={{
          background: '#F0E8DC',
          padding: '8px 12px',
          border: '0.5px solid #E0D5C5',
          color: '#2C1810',
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          padding: '8px 12px',
          border: '0.5px solid #EDE4D8',
          color: '#4A3728',
          lineHeight: '1.6',
        }}
      >
        {children}
      </td>
    ),
  };

  const src = (markdown || '').trim();
  if (!src) {
    return <p style={{ fontSize: fs.p, color: '#8C7355', fontStyle: 'italic', margin: 0 }}>{emptyMessage ?? '—'}</p>;
  }

  return (
    <div>
      {readingLabel || showOutline ? (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            background: '#F7F1E8',
            border: '0.5px solid #E0D5C5',
            borderRadius: 10,
          }}
        >
          {readingLabel ? (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: '#8C7355',
                fontFamily: 'Georgia, serif',
                letterSpacing: '0.02em',
              }}
            >
              {readingLabel}
            </p>
          ) : null}
          {showOutline ? (
            <div style={{ marginTop: readingLabel ? 8 : 0 }}>
              <button
                type="button"
                onClick={() => setOutlineOpen((o) => !o)}
                aria-expanded={outlineOpen}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  gap: 8,
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                  fontSize: 12,
                  color: '#4A3728',
                  fontWeight: 500,
                }}
              >
                <span>
                  On this page
                  <span style={{ color: '#A89070', fontWeight: 400 }}>
                    {' '}
                    · {headings.length} sections
                  </span>
                </span>
                <span style={{ color: '#A89070', fontSize: 11 }} aria-hidden>
                  {outlineOpen ? '▴' : '▾'}
                </span>
              </button>
              {outlineOpen ? (
                <nav aria-label="Answer sections" style={{ marginTop: 8 }}>
                  <ol
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {headings.map((h: AgentAnswerHeading) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => jumpToHeading(h.id)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontFamily: 'Georgia, serif',
                            fontSize: h.level === 1 ? 13 : 12,
                            color: h.level === 3 ? '#8C7355' : '#4A3728',
                            padding: '4px 6px',
                            paddingLeft: 6 + (h.level - 1) * 12,
                            borderRadius: 6,
                            lineHeight: 1.4,
                          }}
                        >
                          {h.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
