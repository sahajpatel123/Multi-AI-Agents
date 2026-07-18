import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { AGENTS } from '../types';
import { isCollapsiblePrompt } from '../lib/collapsiblePrompt';
import { PERSONAS } from '../data/personas';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import {
  applyAbsoluteDocumentTitle,
  applyDocumentTitle,
  titleForShare,
} from '../lib/documentTitle';
import {
  buildNativeShareData,
  buildShareTakeClipboardText,
  canUseNativeShare,
  invokeNativeShare,
} from '../lib/shareUrl';

const MAX_PARAM_LEN = 2000;

function sanitizeParam(raw: string | null, max = MAX_PARAM_LEN): string {
  if (!raw) return '';
  try {
    // React Router already decodes once; tolerate double-encoding.
    let value = raw;
    if (/%[0-9A-Fa-f]{2}/.test(value)) {
      try {
        value = decodeURIComponent(value);
      } catch {
        /* keep as-is */
      }
    }
    return value.replace(/\u0000/g, '').slice(0, max).trim();
  } catch {
    return '';
  }
}

function resolveAgent(agentId: string): { name: string; color: string; oneLiner: string } {
  if (agentId && AGENTS[agentId]) {
    const a = AGENTS[agentId];
    return {
      name: a.name,
      color: a.color,
      oneLiner: a.oneLiner || 'A mind on Arena',
    };
  }
  const persona = PERSONAS.find((p) => p.id === agentId);
  if (persona) {
    return { name: persona.name, color: persona.color, oneLiner: persona.quote };
  }
  return {
    name: agentId ? agentId.replace(/_/g, ' ') : 'An Arena mind',
    color: '#C4956A',
    oneLiner: 'Four minds. One question.',
  };
}

/**
 * Public landing for links copied from Arena share dropdown.
 * Query: ?agent=&prompt=&response=
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [copied, setCopied] = useState<'take' | 'link' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [promptExpanded, setPromptExpanded] = useState(false);

  const agentId = sanitizeParam(params.get('agent'), 64);
  const prompt = sanitizeParam(params.get('prompt'));
  const response = sanitizeParam(params.get('response'));
  const agent = useMemo(() => resolveAgent(agentId), [agentId]);

  const hasContent = Boolean(response || prompt);

  // Prefer mind name (then prompt) in the tab so shared links are scannable in multitasking.
  useEffect(() => {
    applyAbsoluteDocumentTitle(
      titleForShare({
        agentName: agentId ? agent.name : '',
        prompt: hasContent ? prompt : '',
      }),
    );
    return () => applyDocumentTitle('/share');
  }, [agentId, agent.name, prompt, hasContent]);

  const pageUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, [agentId, prompt, response]);

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    setPromptExpanded(false);
  }, [prompt]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const goTry = () => {
    if (isAuthenticated) {
      navigate('/app');
      return;
    }
    setRedirectIntent('/app');
    navigate('/signin');
  };

  const handleCopyTake = async () => {
    setCopyError(null);
    const text = buildShareTakeClipboardText({
      agentName: agent.name,
      prompt,
      response: response || agent.oneLiner,
      shareUrl: pageUrl || undefined,
    });
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied('take');
    } else {
      setCopyError('Could not copy — select the take and copy manually.');
    }
  };

  const handleCopyLink = async () => {
    setCopyError(null);
    const url = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied('link');
    } else {
      setCopyError('Could not copy the link. Long-press the address bar instead.');
    }
  };

  const handleNativeShare = async () => {
    setCopyError(null);
    const oneLiner = response || agent.oneLiner;
    const data = buildNativeShareData({
      agentName: agent.name,
      oneLiner,
      shareUrl: pageUrl || (typeof window !== 'undefined' ? window.location.href : ''),
    });
    const result = await invokeNativeShare(data);
    if (result === 'failed' || result === 'unavailable') {
      setCopyError('Could not open system share. Try Copy link instead.');
    }
  };

  const handleDownloadTake = () => {
    setCopyError(null);
    const text = buildShareTakeClipboardText({
      agentName: agent.name,
      prompt,
      response: response || agent.oneLiner,
      shareUrl: pageUrl || undefined,
    });
    const stem = `arena-share-${(agent.name || 'take').slice(0, 40)}`;
    const ok = downloadMarkdownFile(`${text}\n`, stem);
    if (ok) {
      setDownloadStatus('done');
      window.setTimeout(() => setDownloadStatus('idle'), 2000);
    } else {
      setDownloadStatus('failed');
      setCopyError('Could not download — try Copy take instead.');
      window.setTimeout(() => setDownloadStatus('idle'), 2800);
    }
  };

  return (
    <div style={{ background: '#F5F0E8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main
        style={{
          flex: 1,
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
          padding: '48px 24px 64px',
        }}
      >
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#C4956A',
            marginBottom: 12,
          }}
        >
          Shared from Arena
        </p>

        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: '#1A1714',
            margin: '0 0 28px',
            lineHeight: 1.2,
          }}
        >
          One mind. One take.
        </h1>

        {!hasContent ? (
          <EmptyState
            variant="card"
            title="This share link is empty or expired"
            description="Ask something in Arena and share a take from any of the four minds."
            actions={
              <MotionButton type="button" variant="primary" size="md" onClick={goTry}>
                Try Arena →
              </MotionButton>
            }
          />
        ) : (
          <article
            style={{
              background: '#FAF7F4',
              border: '0.5px solid #E0D8D0',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 12px 32px rgba(44,24,16,0.06)',
            }}
          >
            <div style={{ height: 3, background: agent.color }} />
            <div style={{ padding: '24px 22px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: agent.color,
                    boxShadow: `0 0 0 3px ${agent.color}33`,
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 500, color: '#1A1714' }}>{agent.name}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#A89070',
                  }}
                >
                  Arena take
                </span>
              </div>

              {prompt ? (
                <div style={{ marginBottom: 18 }}>
                  <p
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#A89070',
                      margin: '0 0 6px',
                    }}
                  >
                    The question
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: '#6B6460',
                      fontStyle: 'italic',
                      lineHeight: 1.65,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      display: !promptExpanded && isCollapsiblePrompt(prompt) ? '-webkit-box' : undefined,
                      WebkitLineClamp:
                        !promptExpanded && isCollapsiblePrompt(prompt) ? 4 : undefined,
                      WebkitBoxOrient:
                        !promptExpanded && isCollapsiblePrompt(prompt) ? 'vertical' : undefined,
                      overflow:
                        !promptExpanded && isCollapsiblePrompt(prompt) ? 'hidden' : undefined,
                    }}
                  >
                    {prompt}
                  </p>
                  {isCollapsiblePrompt(prompt) ? (
                    <button
                      type="button"
                      onClick={() => setPromptExpanded((v) => !v)}
                      style={{
                        marginTop: 6,
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: '#C4956A',
                        fontFamily: 'Georgia, serif',
                      }}
                    >
                      {promptExpanded ? 'Show less' : 'Show full question'}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {response ? (
                <div
                  style={{
                    margin: 0,
                    padding: '14px 16px',
                    background: '#FFFFFF',
                    borderLeft: `3px solid ${agent.color}`,
                    borderRadius: '0 12px 12px 0',
                  }}
                >
                  <AgentAnswerMarkdown markdown={response} question={prompt || undefined} />
                </div>
              ) : (
                <p style={{ fontSize: 14, color: '#8C7355', fontStyle: 'italic', margin: 0 }}>
                  {agent.oneLiner}
                </p>
              )}
            </div>

            <div
              style={{
                borderTop: '0.5px solid #E0D8D0',
                padding: '18px 22px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <p style={{ fontSize: 13, color: '#6B6460', margin: 0, lineHeight: 1.6 }}>
                Four minds answer every question. Challenge any take. Keep the best.
              </p>

              {copyError ? (
                <p role="alert" style={{ fontSize: 12, color: '#993C1D', margin: 0, lineHeight: 1.45 }}>
                  {copyError}
                </p>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="arena-btn arena-btn--secondary arena-btn--sm"
                  onClick={() => {
                    void handleCopyTake();
                  }}
                >
                  {copied === 'take' ? 'Copied take' : 'Copy take'}
                </button>
                <button
                  type="button"
                  className="arena-btn arena-btn--secondary arena-btn--sm"
                  onClick={handleDownloadTake}
                >
                  {downloadStatus === 'done'
                    ? 'Downloaded'
                    : downloadStatus === 'failed'
                      ? 'Download failed'
                      : 'Download .md'}
                </button>
                <button
                  type="button"
                  className="arena-btn arena-btn--secondary arena-btn--sm"
                  onClick={() => {
                    void handleCopyLink();
                  }}
                >
                  {copied === 'link' ? 'Link copied' : 'Copy link'}
                </button>
                {nativeShareAvailable ? (
                  <button
                    type="button"
                    className="arena-btn arena-btn--secondary arena-btn--sm"
                    onClick={() => {
                      void handleNativeShare();
                    }}
                  >
                    Share…
                  </button>
                ) : null}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                <MotionButton type="button" variant="primary" size="md" onClick={goTry}>
                  {isAuthenticated ? 'Open Arena' : 'Try this in Arena'} →
                </MotionButton>
                <button
                  type="button"
                  className="arena-btn arena-btn--ghost arena-btn--md"
                  onClick={() => navigate('/product')}
                >
                  How it works
                </button>
              </div>
            </div>
          </article>
        )}
      </main>

      <Footer />
    </div>
  );
}
