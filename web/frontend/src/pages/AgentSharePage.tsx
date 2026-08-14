import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { EmptyState } from '../components/EmptyState';
import { MotionButton } from '../components/MotionButton';
import MicroLoader from '../components/MicroLoader';
import { AgentAnswerMarkdown } from '../components/AgentAnswerMarkdown';
import { getPublicAgentReport, type PublicAgentReport } from '../api';
import { applyAbsoluteDocumentTitle, applyDocumentTitle } from '../lib/documentTitle';
import { setRedirectIntent } from '../utils/redirectIntent';
import { useAuth } from '../hooks/useAuth';
import { formatIsoWhen } from '../lib/relativeTime';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReport(null);
    getPublicAgentReport(token)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'This report could not be loaded.');
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

  useEffect(() => {
    applyAbsoluteDocumentTitle(`Agent report · ${title}`);
    return () => applyDocumentTitle('/share/agent');
  }, [title]);

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
            title="This report link is no longer available"
            description={
              error
                ? 'The report may have been revoked by its owner, or the link is invalid.'
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
