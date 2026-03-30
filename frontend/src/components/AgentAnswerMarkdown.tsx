import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

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

type AgentAnswerMarkdownProps = {
  markdown: string;
  /** When the first # heading matches this (e.g. task text), render as h2 instead. */
  question?: string;
  emptyMessage?: string;
};

export function AgentAnswerMarkdown({ markdown, question, emptyMessage }: AgentAnswerMarkdownProps) {
  const narrow = useNarrow768();
  const firstH1Ref = useRef(true);
  const q = (question || '').trim();

  useEffect(() => {
    firstH1Ref.current = true;
  }, [markdown]);

  const fs = {
    h1: narrow ? 18 : 20,
    h2: narrow ? 15 : 16,
    h3: narrow ? 14 : 14,
    p: narrow ? 14 : 15,
    li: narrow ? 13 : 14,
  };

  const components: Components = {
    h1: ({ children }) => {
      const text = childrenToPlainText(children);
      const dup = firstH1Ref.current && q.length > 0 && normHeading(text) === normHeading(q);
      firstH1Ref.current = false;
      if (dup) {
        return (
          <h2
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
            }}
          >
            {children}
          </h2>
        );
      }
      return (
        <h1
          style={{
            fontSize: fs.h1,
            fontWeight: 500,
            color: '#2C1810',
            fontFamily: 'Georgia, serif',
            marginTop: '24px',
            marginBottom: '10px',
            lineHeight: '1.3',
          }}
        >
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      firstH1Ref.current = false;
      return (
        <h2
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
          }}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => (
      <h3
        style={{
          fontSize: fs.h3,
          fontWeight: 500,
          color: '#4A3728',
          fontFamily: 'Georgia, serif',
          marginTop: '16px',
          marginBottom: '6px',
        }}
      >
        {children}
      </h3>
    ),
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
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}
