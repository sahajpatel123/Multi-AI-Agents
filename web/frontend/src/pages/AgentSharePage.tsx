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
import { downloadMarkdownFile } from '../lib/downloadTextFile';
import { formatAgentAnswerExport } from '../lib/agentAnswerExport';
import { applyAbsoluteDocumentTitle, applyDocumentTitle } from '../lib/documentTitle';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { formatIsoWhen } from '../lib/relativeTime';
import track from '../utils/track';
import '../styles/share-landing.css';

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
  const [linkStatus, setLinkStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [linkCopyError, setLinkCopyError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copyInFlight, setCopyInFlight] = useState(false);
  const [linkCopyInFlight, setLinkCopyInFlight] = useState(false);
  const copyBusyRef = useRef(false);
  const linkCopyBusyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setReport(null);
    setCopyStatus('idle');
    setLinkStatus('idle');
    setDownloadStatus('idle');
    setCopyError(null);
    setLinkCopyError(null);
    setDownloadError(null);
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
          })
        : '',
    [report],
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
    if (downloadStatus === 'idle') return;
    const hold = downloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setDownloadStatus('idle');
      setDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [downloadStatus]);

  useEffect(() => {
    if (linkStatus === 'idle') return;
    const hold = linkStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setLinkStatus('idle');
      setLinkCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [linkStatus]);

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

  const handleCopyLink = async () => {
    if (linkCopyBusyRef.current || !report) return;
    linkCopyBusyRef.current = true;
    setLinkCopyInFlight(true);
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

  const goAgent = () => {
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
    <div className="share-landing">
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
                  {copyError ? (
                    <p className="share-take__error" role="alert">
                      {copyError}
                    </p>
                  ) : null}
                  {downloadError ? (
                    <p className="share-take__error" role="alert">
                      {downloadError}
                    </p>
                  ) : null}
                  {linkCopyError ? (
                    <p className="share-take__error" role="alert">
                      {linkCopyError}
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
                  </div>
                  <span className="share-take__status" role="status" aria-live="polite">
                    {copyStatus === 'copied' ? 'Report copied to clipboard. ' : ''}
                    {linkStatus === 'copied' ? 'Link copied to clipboard. ' : ''}
                    {downloadStatus === 'done' ? 'Report downloaded as markdown.' : ''}
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
