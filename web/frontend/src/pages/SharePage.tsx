import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { ReadAloudButton } from '../components/ReadAloudButton';
import { AGENTS } from '../types';
import { isCollapsiblePrompt } from '../lib/collapsiblePrompt';
import { PERSONAS } from '../data/personas';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import {
  copyCsvToClipboard,
  copyJsonToClipboard,
  copyMarkdownToClipboard,
  copyToClipboard,
} from '../lib/clipboard';
import {
  downloadCsvFile,
  downloadHtmlFile,
  downloadJsonFile,
  downloadMarkdownFile,
} from '../lib/downloadTextFile';
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
import {
  formatRoundShareText,
  parseRoundShareUrl,
  type RoundShareTake,
} from '../lib/roundShare';
import {
  buildShareRoundJsonPayload,
  buildShareTakeJsonPayload,
  formatShareRoundCsv,
} from '../lib/shareExport';
import { formatArenaShareHtml } from '../lib/shareHtml';
import { saveSharedArenaPrompt } from '../lib/sharePrompt';
import track from '../utils/track';
import '../styles/share-landing.css';

const MAX_PARAM_LEN = 2000;
type DownloadStatus = 'idle' | 'done' | 'failed';

function sanitizeParam(raw: string | null, max = MAX_PARAM_LEN): string {
  if (!raw) return '';
  try {
    // React Router/URLSearchParams already decodes the query value once.
    // Decode no further: `%20` can be intentional content inside a Markdown
    // URL, and a second decode would silently change the answer being copied.
    const value = raw;
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
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [copied, setCopied] = useState<
    'take' | 'answer' | 'prompt' | 'link' | 'winner' | 'json' | 'csv' | null
  >(null);
  const [copiedRoundTakeIndex, setCopiedRoundTakeIndex] = useState<number | null>(null);
  const [copyingRoundTakeIndex, setCopyingRoundTakeIndex] = useState<number | null>(null);
  const [copyingWinner, setCopyingWinner] = useState(false);
  const [copyingJson, setCopyingJson] = useState(false);
  const [copyingCsv, setCopyingCsv] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [markdownDownloadStatus, setMarkdownDownloadStatus] = useState<DownloadStatus>('idle');
  const [jsonDownloadStatus, setJsonDownloadStatus] = useState<DownloadStatus>('idle');
  const [csvDownloadStatus, setCsvDownloadStatus] = useState<DownloadStatus>('idle');
  const [htmlDownloadStatus, setHtmlDownloadStatus] = useState<DownloadStatus>('idle');
  const [htmlDownloadFeedbackKey, setHtmlDownloadFeedbackKey] = useState(0);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const copyPromptRequestRef = useRef(0);
  const copyRoundTakeRequestRef = useRef(0);
  const copyWinnerRequestRef = useRef(0);
  const copyJsonRequestRef = useRef(0);
  const copyCsvRequestRef = useRef(0);
  const copyJsonPendingRef = useRef(false);
  const copyCsvPendingRef = useRef(false);
  const copyRoundTakePendingRef = useRef(false);

  const agentId = sanitizeParam(params.get('agent'), 64);
  const prompt = sanitizeParam(params.get('prompt'));
  const response = sanitizeParam(params.get('response'));
  const agent = useMemo(() => resolveAgent(agentId), [agentId]);
  const round = useMemo(() => parseRoundShareUrl(params), [params]);
  const roundRequested = params.get('round') === '1';
  const isRound = round !== null;
  const winnerTake = useMemo(
    () =>
      isRound && round?.winnerAgentId
        ? round.takes.find(
            (take) => take.agentId === round.winnerAgentId && Boolean(take.oneLiner),
          )
        : undefined,
    [isRound, round],
  );
  const shareParamsKey = params.toString();

  const hasContent = roundRequested ? Boolean(round) : Boolean(response || prompt);
  const displayPrompt = isRound && round ? round.prompt : prompt;
  const listenText =
    isRound && round
      ? formatRoundShareText({
          prompt: round.prompt,
          takes: round.takes,
          resolveAgentName: (id) => resolveAgent(id).name,
        })
      : response || agent.oneLiner;
  const listenLabel = isRound ? 'Read this round aloud' : 'Read this take aloud';

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
    return `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    // A SharePage can stay mounted while the query string changes. Clear
    // action feedback for the new payload and invalidate any clipboard
    // result that was started for the previous question.
    copyPromptRequestRef.current += 1;
    copyRoundTakeRequestRef.current += 1;
    copyWinnerRequestRef.current += 1;
    copyJsonRequestRef.current += 1;
    copyCsvRequestRef.current += 1;
    copyRoundTakePendingRef.current = false;
    setCopied(null);
    setCopiedRoundTakeIndex(null);
    setCopyingRoundTakeIndex(null);
    setCopyingWinner(false);
    setCopyingJson(false);
    setCopyingCsv(false);
    copyJsonPendingRef.current = false;
    copyCsvPendingRef.current = false;
    setCopyError(null);
    setPromptExpanded(false);
    setMarkdownDownloadStatus('idle');
    setJsonDownloadStatus('idle');
    setCsvDownloadStatus('idle');
    setHtmlDownloadStatus('idle');
  }, [shareParamsKey]);

  useEffect(() => {
    // Clipboard writes cannot be cancelled. Invalidate a pending CSV write
    // when the page leaves the tree so its eventual result cannot publish
    // feedback into an unmounted share view.
    return () => {
      copyCsvRequestRef.current += 1;
      copyCsvPendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (copiedRoundTakeIndex === null) return;
    const t = window.setTimeout(() => setCopiedRoundTakeIndex(null), 1600);
    return () => window.clearTimeout(t);
  }, [copiedRoundTakeIndex]);

  useEffect(() => {
    if (htmlDownloadStatus === 'idle') return;
    const hold = htmlDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => setHtmlDownloadStatus('idle'), hold);
    return () => window.clearTimeout(t);
  }, [htmlDownloadFeedbackKey, htmlDownloadStatus]);

  const goTry = () => {
    // Hand the shared question to the next Arena mount so "Try this in
    // Arena" lands with the prompt already in the compose box. The handoff
    // is a no-op for empty/expired share links.
    saveSharedArenaPrompt(isRound ? (round?.prompt || '') : prompt);
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

  const handleCopyPrompt = async () => {
    const question = displayPrompt.trim();
    if (!question) return;
    const requestId = ++copyPromptRequestRef.current;
    setCopied(null);
    setCopyError(null);
    try {
      const ok = await copyToClipboard(question);
      if (copyPromptRequestRef.current !== requestId) return;
      if (ok) {
        setCopied('prompt');
      } else {
        setCopyError('Could not copy the question — select it manually.');
      }
    } catch {
      if (copyPromptRequestRef.current !== requestId) return;
      setCopyError('Could not copy the question — select it manually.');
    }
  };

  const handleCopyAnswer = async () => {
    if (isRound) return;
    setCopied(null);
    setCopyError(null);
    try {
      const ok = await copyMarkdownToClipboard(response || agent.oneLiner);
      if (ok) {
        setCopied('answer');
      } else {
        setCopyError('Could not copy the answer — select the text manually.');
      }
    } catch {
      setCopyError('Could not copy the answer — select the text manually.');
    }
  };

  const handleCopyRoundTake = async (take: RoundShareTake, index: number) => {
    if (!isRound || !take.oneLiner || copyRoundTakePendingRef.current) return;
    copyRoundTakePendingRef.current = true;
    const requestId = ++copyRoundTakeRequestRef.current;
    setCopied(null);
    setCopiedRoundTakeIndex(null);
    setCopyingRoundTakeIndex(index);
    setCopyError(null);
    try {
      const ok = await copyMarkdownToClipboard(take.oneLiner);
      if (copyRoundTakeRequestRef.current !== requestId) return;
      if (ok) {
        setCopiedRoundTakeIndex(index);
      } else {
        setCopyError('Could not copy this answer — select the text manually.');
      }
    } catch {
      if (copyRoundTakeRequestRef.current !== requestId) return;
      setCopyError('Could not copy this answer — select the text manually.');
    } finally {
      if (copyRoundTakeRequestRef.current === requestId) {
        copyRoundTakePendingRef.current = false;
        setCopyingRoundTakeIndex(null);
      }
    }
  };

  const handleCopyWinner = async () => {
    if (!isRound || !winnerTake || copyRoundTakePendingRef.current) return;
    copyRoundTakePendingRef.current = true;
    const requestId = ++copyWinnerRequestRef.current;
    setCopied(null);
    setCopiedRoundTakeIndex(null);
    setCopyingWinner(true);
    setCopyError(null);
    try {
      const ok = await copyMarkdownToClipboard(winnerTake.oneLiner);
      if (copyWinnerRequestRef.current !== requestId) return;
      if (ok) {
        setCopied('winner');
      } else {
        setCopyError('Could not copy the winning answer — select the text manually.');
      }
    } catch {
      if (copyWinnerRequestRef.current !== requestId) return;
      setCopyError('Could not copy the winning answer — select the text manually.');
    } finally {
      if (copyWinnerRequestRef.current === requestId) {
        copyRoundTakePendingRef.current = false;
        setCopyingWinner(false);
      }
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
        setMarkdownDownloadStatus('done');
        window.setTimeout(() => setMarkdownDownloadStatus('idle'), 2000);
      } else {
        setMarkdownDownloadStatus('failed');
        setCopyError('Could not download — try Copy round instead.');
        window.setTimeout(() => setMarkdownDownloadStatus('idle'), 2800);
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
      setMarkdownDownloadStatus('done');
      window.setTimeout(() => setMarkdownDownloadStatus('idle'), 2000);
    } else {
      setMarkdownDownloadStatus('failed');
      setCopyError('Could not download — try Copy take instead.');
      window.setTimeout(() => setMarkdownDownloadStatus('idle'), 2800);
    }
  };

  const handleDownloadJson = () => {
    setCopyError(null);
    const shareUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const payload = isRound && round
      ? buildShareRoundJsonPayload({
          round,
          resolveAgentName: (id) => resolveAgent(id).name,
          shareUrl,
        })
      : buildShareTakeJsonPayload({
          agentId,
          agentName: agent.name,
          prompt,
          response: response || agent.oneLiner,
          shareUrl,
        });
    const stem = isRound
      ? 'arena-share-round'
      : `arena-share-${(agent.name || 'take').slice(0, 40)}`;
    const ok = downloadJsonFile(`${JSON.stringify(payload, null, 2)}\n`, stem);
    if (ok) {
      setJsonDownloadStatus('done');
      window.setTimeout(() => setJsonDownloadStatus('idle'), 2000);
    } else {
      setJsonDownloadStatus('failed');
      setCopyError('Could not download JSON — try Download .md instead.');
      window.setTimeout(() => setJsonDownloadStatus('idle'), 2800);
    }
  };

  const handleDownloadHtml = () => {
    setCopyError(null);
    // A repeated synchronous download can keep the same status value. Bump a
    // separate key so its feedback window always starts from this attempt.
    setHtmlDownloadFeedbackKey((current) => current + 1);
    const shareUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const html = isRound && round
      ? formatArenaShareHtml({
          round,
          resolveAgentName: (id) => resolveAgent(id).name,
          shareUrl,
        })
      : formatArenaShareHtml({
          agentName: agent.name,
          prompt,
          response: response || agent.oneLiner,
          shareUrl,
        });
    const stem = isRound
      ? 'arena-share-round'
      : `arena-share-${(agent.name || 'take').slice(0, 40)}`;
    const ok = downloadHtmlFile(html, stem);
    if (ok) {
      setHtmlDownloadStatus('done');
    } else {
      setHtmlDownloadStatus('failed');
      setCopyError('Could not download HTML — try Download .md instead.');
    }
  };

  const handleCopyJson = async () => {
    if (copyJsonPendingRef.current) return;
    copyJsonPendingRef.current = true;
    const requestId = ++copyJsonRequestRef.current;
    setCopied(null);
    setCopyingJson(true);
    setCopyError(null);
    const shareUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const payload = isRound && round
      ? buildShareRoundJsonPayload({
          round,
          resolveAgentName: (id) => resolveAgent(id).name,
          shareUrl,
        })
      : buildShareTakeJsonPayload({
          agentId,
          agentName: agent.name,
          prompt,
          response: response || agent.oneLiner,
          shareUrl,
        });
    try {
      const ok = await copyJsonToClipboard(`${JSON.stringify(payload, null, 2)}\n`);
      if (copyJsonRequestRef.current !== requestId) return;
      if (ok) {
        setCopied('json');
      } else {
        setCopyError('Could not copy JSON — try Download .json instead.');
      }
    } catch {
      if (copyJsonRequestRef.current !== requestId) return;
      setCopyError('Could not copy JSON — try Download .json instead.');
    } finally {
      if (copyJsonRequestRef.current === requestId) {
        copyJsonPendingRef.current = false;
        setCopyingJson(false);
      }
    }
  };

  const handleCopyCsv = async () => {
    if (!isRound || !round || copyCsvPendingRef.current) return;
    copyCsvPendingRef.current = true;
    const requestId = ++copyCsvRequestRef.current;
    setCopied(null);
    setCopyingCsv(true);
    setCopyError(null);
    const shareUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const csv = formatShareRoundCsv({
      round,
      resolveAgentName: (id) => resolveAgent(id).name,
      shareUrl,
    });
    try {
      const ok = await copyCsvToClipboard(csv);
      if (copyCsvRequestRef.current !== requestId) return;
      if (ok) {
        setCopied('csv');
      } else {
        setCopyError('Could not copy CSV — try Download .csv instead.');
      }
    } catch {
      if (copyCsvRequestRef.current !== requestId) return;
      setCopyError('Could not copy CSV — try Download .csv instead.');
    } finally {
      if (copyCsvRequestRef.current === requestId) {
        copyCsvPendingRef.current = false;
        setCopyingCsv(false);
      }
    }
  };

  const handleDownloadCsv = () => {
    if (!isRound || !round) return;
    setCopyError(null);
    const shareUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const csv = formatShareRoundCsv({
      round,
      resolveAgentName: (id) => resolveAgent(id).name,
      shareUrl,
    });
    const ok = downloadCsvFile(csv, 'arena-share-round');
    if (ok) {
      setCsvDownloadStatus('done');
      window.setTimeout(() => setCsvDownloadStatus('idle'), 2000);
    } else {
      setCsvDownloadStatus('failed');
      setCopyError('Could not download CSV — try Download .json instead.');
      window.setTimeout(() => setCsvDownloadStatus('idle'), 2800);
    }
  };

  const handlePrintShare = () => {
    if (!hasContent || typeof window === 'undefined' || typeof window.print !== 'function') return;
    window.print();
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
                        {take.oneLiner ? (
                          <div className="share-take__answer-actions">
                            <button
                              type="button"
                              className={`arena-btn arena-btn--secondary arena-btn--sm${copiedRoundTakeIndex === index ? ' is-success' : ''}`}
                              disabled={copyingRoundTakeIndex !== null || copyingWinner}
                              aria-busy={copyingRoundTakeIndex === index || undefined}
                              aria-label={
                                copyingRoundTakeIndex === index
                                  ? `Copying ${takeAgent.name} answer`
                                  : copiedRoundTakeIndex === index
                                  ? `${takeAgent.name} answer copied`
                                  : `Copy ${takeAgent.name} answer`
                              }
                              onClick={() => {
                                void handleCopyRoundTake(take, index);
                              }}
                            >
                              {copyingRoundTakeIndex === index
                                ? 'Copying…'
                                : copiedRoundTakeIndex === index
                                  ? 'Answer copied'
                                  : 'Copy answer'}
                            </button>
                          </div>
                        ) : null}
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
                  <div className="share-take__listen">
                    <ReadAloudButton
                      text={listenText}
                      label={listenLabel}
                      onStart={() =>
                        void track(
                          'shared_read_aloud',
                          undefined,
                          isRound ? undefined : agentId || undefined,
                        )
                      }
                    />
                    <span aria-hidden="true">Listen</span>
                  </div>
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
                  {!isRound ? (
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'answer' ? ' is-success' : ''}`}
                      onClick={() => {
                        void handleCopyAnswer();
                      }}
                    >
                      {copied === 'answer' ? 'Answer copied' : 'Copy answer'}
                    </button>
                  ) : null}
                  {isRound && winnerTake ? (
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'winner' ? ' is-success' : ''}`}
                      disabled={copyingRoundTakeIndex !== null || copyingWinner}
                      aria-busy={copyingWinner || undefined}
                      aria-label={
                        copyingWinner
                          ? 'Copying winning answer'
                          : copied === 'winner'
                            ? 'Winning answer copied'
                            : 'Copy winner answer'
                      }
                      onClick={() => {
                        void handleCopyWinner();
                      }}
                    >
                      {copyingWinner
                        ? 'Copying…'
                        : copied === 'winner'
                          ? 'Winner copied'
                          : 'Copy winner'}
                    </button>
                  ) : null}
                  {displayPrompt ? (
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'prompt' ? ' is-success' : ''}`}
                      onClick={() => {
                        void handleCopyPrompt();
                      }}
                    >
                      {copied === 'prompt' ? 'Question copied' : 'Copy question'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${markdownDownloadStatus === 'done' ? ' is-success' : ''}`}
                    onClick={handleDownloadTake}
                  >
                    {markdownDownloadStatus === 'done'
                      ? 'Downloaded'
                      : markdownDownloadStatus === 'failed'
                        ? 'Download failed'
                        : 'Download .md'}
                  </button>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${jsonDownloadStatus === 'done' ? ' is-success' : ''}`}
                    onClick={handleDownloadJson}
                  >
                    {jsonDownloadStatus === 'done'
                      ? 'Downloaded'
                      : jsonDownloadStatus === 'failed'
                        ? 'Download failed'
                        : 'Download .json'}
                  </button>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'json' ? ' is-success' : ''}`}
                    disabled={copyingJson}
                    aria-busy={copyingJson || undefined}
                    aria-label={
                      copyingJson
                        ? 'Copying JSON'
                        : copied === 'json'
                          ? 'JSON copied'
                          : 'Copy .json'
                    }
                    title="Copy the structured share payload as JSON"
                    onClick={() => {
                      void handleCopyJson();
                    }}
                  >
                    {copyingJson ? 'Copying…' : copied === 'json' ? 'JSON copied' : 'Copy .json'}
                  </button>
                  <button
                    type="button"
                    className={`arena-btn arena-btn--secondary arena-btn--sm${htmlDownloadStatus === 'done' ? ' is-success' : ''}`}
                    onClick={handleDownloadHtml}
                  >
                    {htmlDownloadStatus === 'done'
                      ? 'Downloaded'
                      : htmlDownloadStatus === 'failed'
                        ? 'Download failed'
                        : 'Download .html'}
                  </button>
                  {isRound ? (
                    <>
                      <button
                        type="button"
                        className={`arena-btn arena-btn--secondary arena-btn--sm${csvDownloadStatus === 'done' ? ' is-success' : ''}`}
                        onClick={handleDownloadCsv}
                      >
                        {csvDownloadStatus === 'done'
                          ? 'Downloaded'
                          : csvDownloadStatus === 'failed'
                            ? 'Download failed'
                            : 'Download .csv'}
                      </button>
                      <button
                        type="button"
                        className={`arena-btn arena-btn--secondary arena-btn--sm${copied === 'csv' ? ' is-success' : ''}`}
                        disabled={copyingCsv}
                        aria-busy={copyingCsv || undefined}
                        aria-label={
                          copyingCsv
                            ? 'Copying CSV'
                            : copied === 'csv'
                              ? 'CSV copied'
                              : 'Copy .csv'
                        }
                        title="Copy the spreadsheet-ready round CSV"
                        onClick={() => {
                          void handleCopyCsv();
                        }}
                      >
                        {copyingCsv ? 'Copying…' : copied === 'csv' ? 'CSV copied' : 'Copy .csv'}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="arena-btn arena-btn--secondary arena-btn--sm"
                    onClick={handlePrintShare}
                  >
                    Print / Save PDF
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

                <span className="share-take__status" role="status" aria-live="polite">
                  {copyingCsv
                    ? 'Copying round CSV to the clipboard.'
                    : copied === 'csv'
                      ? 'Round CSV copied to the clipboard.'
                      : ''}
                </span>

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
