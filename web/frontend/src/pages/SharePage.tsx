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
import { formatRoundShareText, parseRoundShareUrl } from '../lib/roundShare';
import '../styles/share-landing.css';

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
    // Strip embedded NUL bytes — they break URL parsers downstream and aren't
    // a legitimate character in any user-authored share text.
    // eslint-disable-next-line no-control-regex
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
  const round = useMemo(() => parseRoundShareUrl(params), [params]);
  const roundRequested = params.get('round') === '1';
  const isRound = round !== null;

  const hasContent = roundRequested ? Boolean(round) : Boolean(response || prompt);
  const displayPrompt = isRound && round ? round.prompt : prompt;

  // Prefer mind name (then prompt) in the tab so shared links are scannable in multitasking.
  useEffect(() => {
    applyAbsoluteDocumentTitle(
      titleForShare({
        agentName: agentId ? agent.name : '',
        prompt: hasContent ? displayPrompt : '',
      }),
    );
    return () => applyDocumentTitle('/share');
  }, [agentId, agent.name, displayPrompt, hasContent]);

  const pageUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }, []);

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    setPromptExpanded(false);
  }, [displayPrompt]);

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
    if (isRound && round) {
      const text = formatRoundShareText({
        prompt: round.prompt,
        takes: round.takes,
        resolveAgentName: (id) => resolveAgent(id).name,
        shareUrl: pageUrl || undefined,
      });
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied('take');
      } else {
        setCopyError('Could not copy the round — select the text manually.');
      }
      return;
    }
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
    const oneLiner = isRound
      ? displayPrompt || round?.takes[0]?.oneLiner || 'Four minds answered one question on Arena.'
      : response || agent.oneLiner;
    const data = buildNativeShareData({
      agentName: isRound ? 'Arena round' : agent.name,
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
    if (isRound && round) {
      const text = formatRoundShareText({
        prompt: round.prompt,
        takes: round.takes,
        resolveAgentName: (id) => resolveAgent(id).name,
        shareUrl: pageUrl || undefined,
      });
      const ok = downloadMarkdownFile(`${text}\n`, 'arena-share-round');
      if (ok) {
        setDownloadStatus('done');
        window.setTimeout(() => setDownloadStatus('idle'), 2000);
      } else {
        setDownloadStatus('failed');
        setCopyError('Could not download — try Copy round instead.');
        window.setTimeout(() => setDownloadStatus('idle'), 2800);
      }
      return;
    }
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

  const promptClamped = Boolean(
    displayPrompt && !promptExpanded && isCollapsiblePrompt(displayPrompt),
  );

  return (
    <div
      className="share-landing"
      style={{ ['--share-accent' as string]: agent.color || '#c4956a' }}
    >
      <div className="share-landing__orbs" aria-hidden="true">
        <div className="share-landing__orb share-landing__orb--a" />
        <div className="share-landing__orb share-landing__orb--b" />
      </div>
      <Navbar />

      <main className="share-landing__main">
        <p className="share-landing__kicker">
          <span className="share-landing__kicker-dot" aria-hidden="true" />
          Shared from Arena
        </p>

        <h1 className="share-landing__title">
          {isRound ? (
            <>
              Four minds. <em>One round.</em>
            </>
          ) : (
            <>
              One mind. <em>One take.</em>
            </>
          )}
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
          <div className={isRound ? 'share-round' : undefined}>
            {isRound && round ? (
              <>
                {round.prompt ? (
                  <article className="share-take share-take--question">
                    <div className="share-take__rail" aria-hidden="true" />
                    <div className="share-take__body">
                      <div className="share-take__head">
                        <span className="share-take__dot" aria-hidden="true" />
                        <span className="share-take__name">The question</span>
                        <span className="share-take__badge">Arena round</span>
                      </div>
                      <div className="share-take__section">
                        <p className="share-take__label">The question</p>
                        <p
                          className={`share-take__prompt${promptClamped ? ' is-clamped' : ''}`}
                        >
                          {round.prompt}
                        </p>
                        {isCollapsiblePrompt(round.prompt) ? (
                          <button
                            type="button"
                            className="share-take__expand"
                            onClick={() => setPromptExpanded((v) => !v)}
                          >
                            {promptExpanded ? 'Show less' : 'Show full question'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ) : null}
                {round.takes.map((take, index) => {
                  const takeAgent = resolveAgent(take.agentId);
                  const isWinner = round.winnerAgentId
                    ? take.agentId === round.winnerAgentId
                    : false;
                  return (
                    <article
                      key={`${take.agentId || 'take'}-${index}`}
                      className="share-take"
                      style={{ ['--take-color' as string]: takeAgent.color }}
                    >
                      <div className="share-take__rail" aria-hidden="true" />
                      <div className="share-take__body">
                        <div className="share-take__head">
                          <span className="share-take__dot" aria-hidden="true" />
                          <span className="share-take__name">{takeAgent.name}</span>
                          <span className="share-take__badge">
                            {isWinner ? 'Arena winner' : 'Arena take'}
                          </span>
                        </div>
                        {Number.isFinite(take.score) ? (
                          <p className="share-take__score">
                            Score: {Math.round(take.score ?? 0)}/100
                          </p>
                        ) : null}
                        <div className="share-take__answer">
                          <AgentAnswerMarkdown
                            markdown={take.oneLiner}
                            question={round.prompt || undefined}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </>
            ) : (
              <article
                className="share-take"
                style={{ ['--take-color' as string]: agent.color }}
              >
                <div className="share-take__rail" aria-hidden="true" />
                <div className="share-take__body">
                  <div className="share-take__head">
                    <span className="share-take__dot" aria-hidden="true" />
                    <span className="share-take__name">{agent.name}</span>
                    <span className="share-take__badge">Arena take</span>
                  </div>

                  {displayPrompt ? (
                    <div className="share-take__section">
                      <p className="share-take__label">The question</p>
                      <p className={`share-take__prompt${promptClamped ? ' is-clamped' : ''}`}>
                        {displayPrompt}
                      </p>
                      {isCollapsiblePrompt(displayPrompt) ? (
                        <button
                          type="button"
                          className="share-take__expand"
                          onClick={() => setPromptExpanded((v) => !v)}
                        >
                          {promptExpanded ? 'Show less' : 'Show full question'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {response ? (
                    <div className="share-take__answer">
                      <AgentAnswerMarkdown markdown={response} question={prompt || undefined} />
                    </div>
                  ) : (
                    <p className="share-take__fallback">{agent.oneLiner}</p>
                  )}
                </div>
              </article>
            )}

            <article className="share-take share-take--tools">
              <div className="share-take__body">
                <p className="share-take__lede">
                  Four minds answer every question. Challenge any take. Keep the best.
                </p>

                {copyError ? (
                  <p className="share-take__error" role="alert">
                    {copyError}
                  </p>
                ) : null}

                <div className="share-take__tools">
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'take' ? ' is-success' : ''}`}
                    onClick={() => {
                      void handleCopyTake();
                    }}
                  >
                    {copied === 'take'
                      ? isRound
                        ? 'Round copied'
                        : 'Copied take'
                      : isRound
                        ? 'Copy round'
                        : 'Copy take'}
                  </button>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${downloadStatus === 'done' ? ' is-success' : ''}`}
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
                    className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'link' ? ' is-success' : ''}`}
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

                <div className="share-take__ctas">
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
          </div>
        )}

        {hasContent ? (
          <div className="share-landing__minds" aria-hidden="true">
            <span className="share-landing__minds-label">Four minds on every question</span>
            <div className="share-landing__minds-dots">
              <span className="share-landing__minds-dot" />
              <span className="share-landing__minds-dot" />
              <span className="share-landing__minds-dot" />
              <span className="share-landing__minds-dot" />
            </div>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
