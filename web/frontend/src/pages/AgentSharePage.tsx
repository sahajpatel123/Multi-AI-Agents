import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import MicroLoader from '../components/MicroLoader';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { ReadAloudButton } from '../components/ReadAloudButton';
import { ApiError, getPublicAgentReport, type PublicAgentReport } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { downloadCsvFile, downloadJsonFile, downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatAgentAnswerExport } from '../lib/agentAnswerExport';
import { applyAbsoluteDocumentTitle, applyDocumentTitle } from '../lib/documentTitle';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { formatIsoWhen } from '../lib/relativeTime';
import { saveAgentPrefillQuestion } from '../lib/agentPrefill';
import {
  buildNativeShareData,
  canUseNativeShare,
  invokeNativeShare,
} from '../lib/shareUrl';
import track from '../utils/track';
import '../styles/share-landing.css';

function safeSourceHref(source: string): string | null {
  const value = source.trim();
  // The public API appends an ellipsis when it bounds an oversized source.
  // Keep that display value as text: linking it would navigate to an
  // incomplete URL and make a truncated reference look authoritative.
  if (!/^https?:\/\//i.test(value) || value.endsWith('…')) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatSourceCsv(sources: readonly string[]): string {
  const escapeCell = (raw: string) => {
    // Quote every cell for consistent parsing, and neutralize formula-like
    // source text so opening a public report in a spreadsheet cannot execute
    // an accidental formula.
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  return [
    `${escapeCell('source_number')},${escapeCell('source')}`,
    ...sources.map((source, index) => `${escapeCell(String(index + 1))},${escapeCell(source)}`),
    '',
  ].join('\r\n');
}

/**
 * Public landing for shared Agent Mode reports (/share/agent/:token).
 * Renders only the sanitized payload the backend publishes — no user or
 * task internals — and offers a CTA to run the same question in Agent Mode.
 */
export function AgentSharePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [report, setReport] = useState<PublicAgentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [sourceCopyStatus, setSourceCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonDownloadStatus, setJsonDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonDownloadFeedbackKey, setJsonDownloadFeedbackKey] = useState(0);
  const [csvDownloadStatus, setCsvDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [csvDownloadFeedbackKey, setCsvDownloadFeedbackKey] = useState(0);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [nativeShareStatus, setNativeShareStatus] = useState<'idle' | 'shared' | 'failed'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [sourceCopyError, setSourceCopyError] = useState<string | null>(null);
  const [linkCopyError, setLinkCopyError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [jsonDownloadError, setJsonDownloadError] = useState<string | null>(null);
  const [csvDownloadError, setCsvDownloadError] = useState<string | null>(null);
  const [nativeShareError, setNativeShareError] = useState<string | null>(null);
  const [copyInFlight, setCopyInFlight] = useState(false);
  const [sourceCopyInFlight, setSourceCopyInFlight] = useState(false);
  const [linkCopyInFlight, setLinkCopyInFlight] = useState(false);
  const [nativeShareInFlight, setNativeShareInFlight] = useState(false);
  const copyBusyRef = useRef(false);
  const sourceCopyBusyRef = useRef(false);
  const sourceCopyRequestRef = useRef(0);
  const linkCopyBusyRef = useRef(false);
  const nativeShareBusyRef = useRef(false);
  const nativeShareRequestRef = useRef(0);

  useEffect(() => {
    // A native share sheet can stay open while the user navigates to another
    // report. Invalidate the old request so its eventual result cannot paint
    // feedback for the new report.
    nativeShareRequestRef.current += 1;
    nativeShareBusyRef.current = false;
    setNativeShareInFlight(false);
    sourceCopyRequestRef.current += 1;
    sourceCopyBusyRef.current = false;
    setSourceCopyInFlight(false);
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setReport(null);
    setCopyStatus('idle');
    setSourceCopyStatus('idle');
    setLinkStatus('idle');
    setDownloadStatus('idle');
    setJsonDownloadStatus('idle');
    setJsonDownloadFeedbackKey(0);
    setCsvDownloadStatus('idle');
    setCsvDownloadFeedbackKey(0);
    setNativeShareStatus('idle');
    setCopyError(null);
    setSourceCopyError(null);
    setLinkCopyError(null);
    setDownloadError(null);
    setJsonDownloadError(null);
    setCsvDownloadError(null);
    setNativeShareError(null);
    getPublicAgentReport(token)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
      })
      .catch((e) => {
        if (cancelled) return;
        const isNotFound = e instanceof ApiError && e.status === 404;
        setNotFound(isNotFound);
        setError(
          isNotFound
            ? null
            : e instanceof Error
              ? e.message
              : 'This report could not be loaded.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      nativeShareRequestRef.current += 1;
      sourceCopyRequestRef.current += 1;
    };
  }, [token]);

  const title = useMemo(
    () => (report?.title || report?.question || 'Shared Agent report').slice(0, 120),
    [report],
  );

  const exportMarkdown = useMemo(
    () =>
      report
        ? formatAgentAnswerExport({
            question: report.question || '',
            answer: report.answer || '',
            sources: report.sources,
          })
        : '',
    [report],
  );

  const publicSources = useMemo(
    () =>
      (report?.sources ?? [])
        .map((source) => source.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    [report],
  );

  const sourceClipboardText = useMemo(
    () =>
      publicSources.length > 0
        ? [
            'Sources consulted',
            '',
            ...publicSources.map((source, index) => `${index + 1}. ${source}`),
            '',
          ].join('\n')
        : '',
    [publicSources],
  );

  const sourceCsvText = useMemo(
    () => (publicSources.length > 0 ? formatSourceCsv(publicSources) : ''),
    [publicSources],
  );

  const pageUrl = typeof window === 'undefined' ? '' : window.location.href;

  const listenText = useMemo(
    () => (report ? [report.question, report.answer].filter(Boolean).join('\n\n') : ''),
    [report],
  );

  useEffect(() => {
    applyAbsoluteDocumentTitle(`Agent report · ${title}`);
    return () => applyDocumentTitle('/share/agent');
  }, [title]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const hold = copyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setCopyStatus('idle');
      setCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [copyStatus]);

  useEffect(() => {
    if (sourceCopyStatus === 'idle') return;
    const hold = sourceCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setSourceCopyStatus('idle');
      setSourceCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [sourceCopyStatus]);

  useEffect(() => {
    if (downloadStatus === 'idle') return;
    const hold = downloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setDownloadStatus('idle');
      setDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [downloadStatus]);

  useEffect(() => {
    if (jsonDownloadStatus === 'idle') return;
    const hold = jsonDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setJsonDownloadStatus('idle');
      setJsonDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [jsonDownloadFeedbackKey, jsonDownloadStatus]);

  useEffect(() => {
    if (csvDownloadStatus === 'idle') return;
    const hold = csvDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setCsvDownloadStatus('idle');
      setCsvDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [csvDownloadFeedbackKey, csvDownloadStatus]);

  useEffect(() => {
    if (linkStatus === 'idle') return;
    const hold = linkStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setLinkStatus('idle');
      setLinkCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [linkStatus]);

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useEffect(() => {
    if (nativeShareStatus === 'idle') return;
    const hold = nativeShareStatus === 'failed' ? 2800 : 2200;
    const t = window.setTimeout(() => {
      setNativeShareStatus('idle');
      setNativeShareError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [nativeShareStatus]);

  const handleCopyReport = async () => {
    if (copyBusyRef.current || !report) return;
    copyBusyRef.current = true;
    setCopyInFlight(true);
    setCopyError(null);
    try {
      const ok = await copyToClipboard(exportMarkdown);
      if (ok) {
        setCopyStatus('copied');
      } else {
        setCopyStatus('failed');
        setCopyError('Could not copy the report — select the text manually.');
      }
    } catch {
      setCopyStatus('failed');
      setCopyError('Could not copy the report — select the text manually.');
    } finally {
      copyBusyRef.current = false;
      setCopyInFlight(false);
    }
  };

  const handleCopySources = async () => {
    if (sourceCopyBusyRef.current || !sourceClipboardText) return;
    sourceCopyBusyRef.current = true;
    setSourceCopyInFlight(true);
    const requestId = sourceCopyRequestRef.current;
    // Reset an existing result before retrying so every attempt gets a full
    // feedback window, including repeated clicks on "Sources copied".
    setSourceCopyStatus('idle');
    setSourceCopyError(null);
    try {
      const ok = await copyToClipboard(sourceClipboardText);
      if (sourceCopyRequestRef.current !== requestId) return;
      if (ok) {
        setSourceCopyStatus('copied');
      } else {
        setSourceCopyStatus('failed');
        setSourceCopyError('Could not copy the sources — copy them manually from the list.');
      }
    } catch {
      if (sourceCopyRequestRef.current !== requestId) return;
      setSourceCopyStatus('failed');
      setSourceCopyError('Could not copy the sources — copy them manually from the list.');
    } finally {
      if (sourceCopyRequestRef.current === requestId) {
        sourceCopyBusyRef.current = false;
        setSourceCopyInFlight(false);
      }
    }
  };

  const handleDownloadReport = () => {
    if (!report) return;
    setDownloadError(null);
    const stem = `agent-share-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadMarkdownFile(exportMarkdown, stem);
    if (ok) {
      setDownloadStatus('done');
    } else {
      setDownloadStatus('failed');
      setDownloadError('Could not download the report — try Copy report instead.');
    }
  };

  const handleDownloadJsonReport = () => {
    if (!report) return;
    setJsonDownloadError(null);
    // A second synchronous download can keep the same status value (done or
    // failed), so the status effect would otherwise keep the first timer.
    // Bump a separate key to give every attempt its own feedback window.
    setJsonDownloadFeedbackKey((current) => current + 1);
    const payload = JSON.stringify(
      {
        format: 'arena-agent-report',
        version: 1,
        title: report.title || 'Full report',
        question: report.question,
        answer: report.answer,
        finalScore: report.finalScore,
        finalConfidence: report.finalConfidence,
        sources: report.sources,
        createdAt: report.createdAt,
        sharedAt: report.sharedAt,
      },
      null,
      2,
    );
    const stem = `agent-share-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadJsonFile(`${payload}\n`, stem);
    if (ok) {
      setJsonDownloadStatus('done');
    } else {
      setJsonDownloadStatus('failed');
      setJsonDownloadError('Could not download the JSON report — try Download .md instead.');
    }
  };

  const handleDownloadSourcesCsv = () => {
    if (!report || !sourceCsvText) return;
    setCsvDownloadError(null);
    // Keep repeated synchronous downloads observable even when the status
    // remains "done" so the feedback timer restarts for every click.
    setCsvDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-sources-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadCsvFile(sourceCsvText, stem);
    if (ok) {
      setCsvDownloadStatus('done');
    } else {
      setCsvDownloadStatus('failed');
      setCsvDownloadError('Could not download the sources CSV — try Copy sources instead.');
    }
  };

  const handlePrintReport = () => {
    if (!report || typeof window === 'undefined' || typeof window.print !== 'function') return;
    window.print();
  };

  const handleCopyLink = async () => {
    if (linkCopyBusyRef.current || !report) return;
    linkCopyBusyRef.current = true;
    setLinkCopyInFlight(true);
    // Reset an existing result before retrying so the feedback effect can
    // start a fresh timer when the new copy attempt completes. Without this,
    // clicking "Link copied" again reuses the old timer and can clear the
    // second result almost immediately.
    setLinkStatus('idle');
    setLinkCopyError(null);
    try {
      const ok = await copyToClipboard(pageUrl);
      if (ok) {
        setLinkStatus('copied');
      } else {
        setLinkStatus('failed');
        setLinkCopyError('Could not copy the link — copy it from the address bar instead.');
      }
    } catch {
      setLinkStatus('failed');
      setLinkCopyError('Could not copy the link — copy it from the address bar instead.');
    } finally {
      linkCopyBusyRef.current = false;
      setLinkCopyInFlight(false);
    }
  };

  const handleNativeShare = async () => {
    if (nativeShareBusyRef.current || !report) return;
    nativeShareBusyRef.current = true;
    setNativeShareInFlight(true);
    const requestId = nativeShareRequestRef.current;
    setNativeShareStatus('idle');
    setNativeShareError(null);
    const data = buildNativeShareData({
      agentName: report.title || 'Agent report',
      oneLiner: report.question || report.answer || 'A completed Agent report on Arena.',
      shareUrl: pageUrl,
    });
    try {
      const result = await invokeNativeShare(data);
      if (nativeShareRequestRef.current !== requestId) return;
      if (result === 'shared') {
        setNativeShareStatus('shared');
        void track('response_shared');
      } else if (result === 'failed' || result === 'unavailable') {
        setNativeShareStatus('failed');
        setNativeShareError('Could not open system share — try Copy link instead.');
      }
    } finally {
      if (nativeShareRequestRef.current === requestId) {
        nativeShareBusyRef.current = false;
        setNativeShareInFlight(false);
      }
    }
  };

  const goAgent = () => {
    // AgentPage consumes this one-shot handoff after a guest passes through
    // sign-in. The helper also bounds public payloads to the Agent limit.
    saveAgentPrefillQuestion(report?.question);
    if (isAuthenticated) {
      navigate('/agent');
      return;
    }
    setRedirectIntent('/agent');
    navigate('/signin');
  };

  const sharedWhen = report?.sharedAt
    ? formatIsoWhen(report.sharedAt)
    : report?.createdAt
      ? formatIsoWhen(report.createdAt)
      : null;

  return (
    <div className="share-landing share-landing--agent">
      <div className="share-landing__orbs" aria-hidden="true">
        <div className="share-landing__orb share-landing__orb--a" />
        <div className="share-landing__orb share-landing__orb--b" />
      </div>
      <Navbar />

      <main className="share-landing__main">
        <p className="share-landing__kicker">
          <span className="share-landing__kicker-dot" aria-hidden="true" />
          Shared Agent report
        </p>

        <h1 className="share-landing__title">
          Deep research. <em>One report.</em>
        </h1>

        {loading ? (
          <div aria-live="polite" aria-busy="true">
            <MicroLoader />
          </div>
        ) : error || !report ? (
          <EmptyState
            variant="card"
            title={
              notFound
                ? 'This report link is no longer available'
                : 'Could not load this report'
            }
            description={
              notFound
                ? 'The report may have been revoked by its owner, or the link is invalid.'
                : error
                  ? 'Could not load this report — check your connection and try again.'
                : 'Ask a hard question in Agent Mode and share the finished report.'
            }
            actions={
              <MotionButton type="button" variant="primary" size="md" onClick={goAgent}>
                Run it in Agent Mode →
              </MotionButton>
            }
          />
        ) : (
          <div className="share-round">
            {report.question ? (
              <article className="share-take share-take--question">
                <div className="share-take__rail" aria-hidden="true" />
                <div className="share-take__body">
                  <div className="share-take__head">
                    <span className="share-take__dot" aria-hidden="true" />
                    <span className="share-take__name">The research question</span>
                    <span className="share-take__badge">Agent Mode</span>
                  </div>
                  <div className="share-take__section">
                    <p className="share-take__label">The question</p>
                    <p className="share-take__prompt">{report.question}</p>
                  </div>
                  {report.finalScore != null || report.finalConfidence != null || sharedWhen ? (
                    <p className="share-take__score">
                      {report.finalScore != null ? `Score ${Math.round(report.finalScore)} · ` : ''}
                      {report.finalConfidence != null
                        ? `Confidence ${Math.round(report.finalConfidence * 100)}% · `
                        : ''}
                      {sharedWhen ? `Shared ${sharedWhen}` : ''}
                    </p>
                  ) : null}
                </div>
              </article>
            ) : null}

            <article className="share-take">
              <div className="share-take__rail" aria-hidden="true" />
              <div className="share-take__body">
                <div className="share-take__head">
                  <span className="share-take__dot" aria-hidden="true" />
                  <span className="share-take__name">{report.title || 'Full report'}</span>
                  <span className="share-take__badge">Completed</span>
                </div>
                <div className="share-take__section">
                  <p className="share-take__label">The report</p>
                  <AgentAnswerMarkdown markdown={report.answer} question={report.question} />
                  {publicSources.length > 0 ? (
                    <section className="share-take__sources" aria-label="Sources consulted">
                      <div className="share-take__sources-head">
                        <p className="share-take__label">Sources consulted</p>
                        <button
                          type="button"
                          className={`share-take__sources-copy arena-btn arena-btn--secondary arena-btn--sm${sourceCopyStatus === 'copied' ? ' is-success' : ''}${sourceCopyStatus === 'failed' ? ' is-error' : ''}`}
                          onClick={() => void handleCopySources()}
                          disabled={sourceCopyInFlight}
                        >
                          {sourceCopyInFlight
                            ? 'Copying…'
                            : sourceCopyStatus === 'copied'
                              ? 'Sources copied'
                              : sourceCopyStatus === 'failed'
                                ? 'Copy sources failed'
                                : 'Copy sources'}
                        </button>
                        <button
                          type="button"
                          className={`share-take__sources-copy arena-btn arena-btn--secondary arena-btn--sm${csvDownloadStatus === 'done' ? ' is-success' : ''}${csvDownloadStatus === 'failed' ? ' is-error' : ''}`}
                          onClick={handleDownloadSourcesCsv}
                        >
                          {csvDownloadStatus === 'done'
                            ? 'Sources CSV downloaded'
                            : csvDownloadStatus === 'failed'
                              ? 'Sources CSV failed'
                              : 'Download sources .csv'}
                        </button>
                      </div>
                      <ol className="share-take__sources-list">
                        {publicSources.map((source, index) => {
                          const href = safeSourceHref(source);
                          return (
                            <li key={`${source}-${index}`}>
                              {href ? (
                                <a href={href} target="_blank" rel="noreferrer noopener">
                                  {source}
                                </a>
                              ) : (
                                <span>{source}</span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ) : null}
                  {copyError ? (
                    <p className="share-take__error" role="alert">
                      {copyError}
                    </p>
                  ) : null}
                  {sourceCopyError ? (
                    <p className="share-take__error" role="alert">
                      {sourceCopyError}
                    </p>
                  ) : null}
                  {downloadError ? (
                    <p className="share-take__error" role="alert">
                      {downloadError}
                    </p>
                  ) : null}
                  {jsonDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {jsonDownloadError}
                    </p>
                  ) : null}
                  {csvDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {csvDownloadError}
                    </p>
                  ) : null}
                  {linkCopyError ? (
                    <p className="share-take__error" role="alert">
                      {linkCopyError}
                    </p>
                  ) : null}
                  {nativeShareError ? (
                    <p className="share-take__error" role="alert">
                      {nativeShareError}
                    </p>
                  ) : null}
                  <div className="share-take__tools">
                    <div className="share-take__listen">
                      <ReadAloudButton
                        text={listenText}
                        label="Read report aloud"
                        onStart={() => void track('shared_read_aloud')}
                      />
                      <span aria-hidden="true">Listen</span>
                    </div>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${copyStatus === 'copied' ? ' is-success' : ''}${copyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyReport()}
                      disabled={copyInFlight}
                    >
                      {copyInFlight
                        ? 'Copying…'
                        : copyStatus === 'copied'
                        ? 'Report copied'
                        : copyStatus === 'failed'
                          ? 'Copy failed'
                          : 'Copy report'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${downloadStatus === 'done' ? ' is-success' : ''}${downloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadReport}
                    >
                      {downloadStatus === 'done'
                        ? 'Downloaded'
                        : downloadStatus === 'failed'
                          ? 'Download failed'
                          : 'Download .md'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${jsonDownloadStatus === 'done' ? ' is-success' : ''}${jsonDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadJsonReport}
                    >
                      {jsonDownloadStatus === 'done'
                        ? 'JSON downloaded'
                        : jsonDownloadStatus === 'failed'
                          ? 'JSON download failed'
                          : 'Download .json'}
                    </button>
                    <button
                      type="button"
                      className="arena-btn arena-btn--secondary arena-btn--sm"
                      onClick={handlePrintReport}
                    >
                      Print / Save PDF
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${linkStatus === 'copied' ? ' is-success' : ''}${linkStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyLink()}
                      disabled={linkCopyInFlight}
                    >
                      {linkCopyInFlight
                        ? 'Copying…'
                        : linkStatus === 'copied'
                          ? 'Link copied'
                          : linkStatus === 'failed'
                            ? 'Link copy failed'
                            : 'Copy link'}
                    </button>
                    {nativeShareAvailable ? (
                      <button
                        type="button"
                        aria-label={
                          nativeShareInFlight
                            ? 'Sharing report'
                            : nativeShareStatus === 'shared'
                              ? 'Shared!'
                              : nativeShareStatus === 'failed'
                                ? 'Share failed'
                                : 'Share report'
                        }
                        className={`arena-btn arena-btn--secondary arena-btn--sm${nativeShareStatus === 'shared' ? ' is-success' : ''}${nativeShareStatus === 'failed' ? ' is-error' : ''}`}
                        onClick={() => void handleNativeShare()}
                        disabled={nativeShareInFlight}
                      >
                        {nativeShareInFlight
                          ? 'Sharing…'
                          : nativeShareStatus === 'shared'
                            ? 'Shared!'
                            : nativeShareStatus === 'failed'
                              ? 'Share failed'
                              : 'Share…'}
                      </button>
                    ) : null}
                  </div>
                  <span className="share-take__status" role="status" aria-live="polite">
                    {copyStatus === 'copied' ? 'Report copied to clipboard. ' : ''}
                    {sourceCopyStatus === 'copied' ? 'Sources copied to clipboard. ' : ''}
                    {linkStatus === 'copied' ? 'Link copied to clipboard. ' : ''}
                    {downloadStatus === 'done' ? 'Report downloaded as markdown.' : ''}
                    {jsonDownloadStatus === 'done' ? 'Report downloaded as JSON.' : ''}
                    {csvDownloadStatus === 'done' ? 'Sources downloaded as CSV.' : ''}
                    {nativeShareStatus === 'shared' ? 'Report shared using the system share sheet.' : ''}
                  </span>
                </div>
                <div className="share-take__ctas">
                  <MotionButton type="button" variant="primary" size="md" onClick={goAgent}>
                    Run your own research →
                  </MotionButton>
                </div>
              </div>
            </article>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
