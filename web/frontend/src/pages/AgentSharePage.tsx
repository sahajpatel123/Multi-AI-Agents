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
import { copyJsonToClipboard, copyToClipboard } from '../lib/clipboard';
import {
  downloadApaFile,
  downloadBibtexFile,
  downloadChicagoFile,
  downloadCsvFile,
  downloadCitationBundleFile,
  downloadCslJsonFile,
  downloadJsonFile,
  downloadIeeeFile,
  downloadMarkdownFile,
  downloadRisFile,
} from '../lib/downloadTextFile';
import { formatAgentAnswerExport } from '../lib/agentAnswerExport';
import { formatAgentReportBibtex } from '../lib/agentReportBibtex';
import { formatAgentReportApa } from '../lib/agentReportApa';
import { formatAgentReportChicago } from '../lib/agentReportChicago';
import { formatAgentReportCitation } from '../lib/agentReportCitation';
import { formatAgentReportCitationBundle } from '../lib/agentReportCitationBundle';
import { formatAgentReportCslJson } from '../lib/agentReportCslJson';
import { formatAgentReportIeee } from '../lib/agentReportIeee';
import { formatAgentReportMla } from '../lib/agentReportMla';
import { formatAgentReportRis } from '../lib/agentReportRis';
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

  // Match Arena's other spreadsheet exports so Excel detects UTF-8 source
  // labels and URLs instead of opening non-ASCII text with a legacy encoding.
  return (
    '\uFEFF' +
    [
      `${escapeCell('source_number')},${escapeCell('source')}`,
      ...sources.map((source, index) => `${escapeCell(String(index + 1))},${escapeCell(source)}`),
      '',
    ].join('\r\n')
  );
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
  const [bibtexCopyStatus, setBibtexCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [cslJsonCopyStatus, setCslJsonCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [citationCopyStatus, setCitationCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [bundleCopyStatus, setBundleCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [apaCopyStatus, setApaCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [chicagoCopyStatus, setChicagoCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [mlaCopyStatus, setMlaCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [ieeeCopyStatus, setIeeeCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [risCopyStatus, setRisCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [sourceCopyStatus, setSourceCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonDownloadStatus, setJsonDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [jsonDownloadFeedbackKey, setJsonDownloadFeedbackKey] = useState(0);
  const [apaDownloadStatus, setApaDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [apaDownloadFeedbackKey, setApaDownloadFeedbackKey] = useState(0);
  const [chicagoDownloadStatus, setChicagoDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [chicagoDownloadFeedbackKey, setChicagoDownloadFeedbackKey] = useState(0);
  const [ieeeDownloadStatus, setIeeeDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [ieeeDownloadFeedbackKey, setIeeeDownloadFeedbackKey] = useState(0);
  const [bundleDownloadStatus, setBundleDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [bundleDownloadFeedbackKey, setBundleDownloadFeedbackKey] = useState(0);
  const [bibtexDownloadStatus, setBibtexDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [bibtexDownloadFeedbackKey, setBibtexDownloadFeedbackKey] = useState(0);
  const [risDownloadStatus, setRisDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [risDownloadFeedbackKey, setRisDownloadFeedbackKey] = useState(0);
  const [cslJsonDownloadStatus, setCslJsonDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [cslJsonDownloadFeedbackKey, setCslJsonDownloadFeedbackKey] = useState(0);
  const [csvDownloadStatus, setCsvDownloadStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [csvDownloadFeedbackKey, setCsvDownloadFeedbackKey] = useState(0);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [nativeShareStatus, setNativeShareStatus] = useState<'idle' | 'shared' | 'failed'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [bibtexCopyError, setBibtexCopyError] = useState<string | null>(null);
  const [cslJsonCopyError, setCslJsonCopyError] = useState<string | null>(null);
  const [citationCopyError, setCitationCopyError] = useState<string | null>(null);
  const [bundleCopyError, setBundleCopyError] = useState<string | null>(null);
  const [apaCopyError, setApaCopyError] = useState<string | null>(null);
  const [chicagoCopyError, setChicagoCopyError] = useState<string | null>(null);
  const [mlaCopyError, setMlaCopyError] = useState<string | null>(null);
  const [ieeeCopyError, setIeeeCopyError] = useState<string | null>(null);
  const [risCopyError, setRisCopyError] = useState<string | null>(null);
  const [sourceCopyError, setSourceCopyError] = useState<string | null>(null);
  const [linkCopyError, setLinkCopyError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [jsonDownloadError, setJsonDownloadError] = useState<string | null>(null);
  const [apaDownloadError, setApaDownloadError] = useState<string | null>(null);
  const [chicagoDownloadError, setChicagoDownloadError] = useState<string | null>(null);
  const [ieeeDownloadError, setIeeeDownloadError] = useState<string | null>(null);
  const [bundleDownloadError, setBundleDownloadError] = useState<string | null>(null);
  const [bibtexDownloadError, setBibtexDownloadError] = useState<string | null>(null);
  const [risDownloadError, setRisDownloadError] = useState<string | null>(null);
  const [cslJsonDownloadError, setCslJsonDownloadError] = useState<string | null>(null);
  const [csvDownloadError, setCsvDownloadError] = useState<string | null>(null);
  const [nativeShareError, setNativeShareError] = useState<string | null>(null);
  const [copyInFlight, setCopyInFlight] = useState(false);
  const [bibtexCopyInFlight, setBibtexCopyInFlight] = useState(false);
  const [cslJsonCopyInFlight, setCslJsonCopyInFlight] = useState(false);
  const [citationCopyInFlight, setCitationCopyInFlight] = useState(false);
  const [bundleCopyInFlight, setBundleCopyInFlight] = useState(false);
  const [apaCopyInFlight, setApaCopyInFlight] = useState(false);
  const [chicagoCopyInFlight, setChicagoCopyInFlight] = useState(false);
  const [mlaCopyInFlight, setMlaCopyInFlight] = useState(false);
  const [ieeeCopyInFlight, setIeeeCopyInFlight] = useState(false);
  const [risCopyInFlight, setRisCopyInFlight] = useState(false);
  const [sourceCopyInFlight, setSourceCopyInFlight] = useState(false);
  const [linkCopyInFlight, setLinkCopyInFlight] = useState(false);
  const [nativeShareInFlight, setNativeShareInFlight] = useState(false);
  const copyBusyRef = useRef(false);
  const bibtexCopyBusyRef = useRef(false);
  const bibtexCopyRequestRef = useRef(0);
  const cslJsonCopyBusyRef = useRef(false);
  const cslJsonCopyRequestRef = useRef(0);
  const citationCopyBusyRef = useRef(false);
  const bundleCopyBusyRef = useRef(false);
  const bundleCopyRequestRef = useRef(0);
  const citationCopyRequestRef = useRef(0);
  const apaCopyBusyRef = useRef(false);
  const apaCopyRequestRef = useRef(0);
  const chicagoCopyBusyRef = useRef(false);
  const chicagoCopyRequestRef = useRef(0);
  const mlaCopyBusyRef = useRef(false);
  const mlaCopyRequestRef = useRef(0);
  const ieeeCopyBusyRef = useRef(false);
  const ieeeCopyRequestRef = useRef(0);
  const risCopyBusyRef = useRef(false);
  const risCopyRequestRef = useRef(0);
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
    bibtexCopyRequestRef.current += 1;
    bibtexCopyBusyRef.current = false;
    setBibtexCopyInFlight(false);
    cslJsonCopyRequestRef.current += 1;
    cslJsonCopyBusyRef.current = false;
    setCslJsonCopyInFlight(false);
    citationCopyRequestRef.current += 1;
    citationCopyBusyRef.current = false;
    setCitationCopyInFlight(false);
    bundleCopyRequestRef.current += 1;
    bundleCopyBusyRef.current = false;
    setBundleCopyInFlight(false);
    apaCopyRequestRef.current += 1;
    apaCopyBusyRef.current = false;
    setApaCopyInFlight(false);
    chicagoCopyRequestRef.current += 1;
    chicagoCopyBusyRef.current = false;
    setChicagoCopyInFlight(false);
    mlaCopyRequestRef.current += 1;
    mlaCopyBusyRef.current = false;
    setMlaCopyInFlight(false);
    ieeeCopyRequestRef.current += 1;
    ieeeCopyBusyRef.current = false;
    setIeeeCopyInFlight(false);
    risCopyRequestRef.current += 1;
    risCopyBusyRef.current = false;
    setRisCopyInFlight(false);
    sourceCopyRequestRef.current += 1;
    sourceCopyBusyRef.current = false;
    setSourceCopyInFlight(false);
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setReport(null);
    setCopyStatus('idle');
    setBibtexCopyStatus('idle');
    setCslJsonCopyStatus('idle');
    setCitationCopyStatus('idle');
    setBundleCopyStatus('idle');
    setApaCopyStatus('idle');
    setChicagoCopyStatus('idle');
    setMlaCopyStatus('idle');
    setIeeeCopyStatus('idle');
    setRisCopyStatus('idle');
    setSourceCopyStatus('idle');
    setLinkStatus('idle');
    setDownloadStatus('idle');
    setJsonDownloadStatus('idle');
    setJsonDownloadFeedbackKey(0);
    setApaDownloadStatus('idle');
    setApaDownloadFeedbackKey(0);
    setChicagoDownloadStatus('idle');
    setChicagoDownloadFeedbackKey(0);
    setIeeeDownloadStatus('idle');
    setIeeeDownloadFeedbackKey(0);
    setBundleDownloadStatus('idle');
    setBundleDownloadFeedbackKey(0);
    setBibtexDownloadStatus('idle');
    setBibtexDownloadFeedbackKey(0);
    setRisDownloadStatus('idle');
    setRisDownloadFeedbackKey(0);
    setCslJsonDownloadStatus('idle');
    setCslJsonDownloadFeedbackKey(0);
    setCsvDownloadStatus('idle');
    setCsvDownloadFeedbackKey(0);
    setNativeShareStatus('idle');
    setCopyError(null);
    setBibtexCopyError(null);
    setCslJsonCopyError(null);
    setCitationCopyError(null);
    setBundleCopyError(null);
    setApaCopyError(null);
    setChicagoCopyError(null);
    setMlaCopyError(null);
    setIeeeCopyError(null);
    setRisCopyError(null);
    setSourceCopyError(null);
    setLinkCopyError(null);
    setDownloadError(null);
    setJsonDownloadError(null);
    setApaDownloadError(null);
    setChicagoDownloadError(null);
    setIeeeDownloadError(null);
    setBundleDownloadError(null);
    setBibtexDownloadError(null);
    setRisDownloadError(null);
    setCslJsonDownloadError(null);
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
      bibtexCopyRequestRef.current += 1;
      cslJsonCopyRequestRef.current += 1;
      citationCopyRequestRef.current += 1;
      bundleCopyRequestRef.current += 1;
      apaCopyRequestRef.current += 1;
      chicagoCopyRequestRef.current += 1;
      mlaCopyRequestRef.current += 1;
      ieeeCopyRequestRef.current += 1;
      risCopyRequestRef.current += 1;
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

  const citationUrl = useMemo(() => {
    if (!pageUrl) return '';
    try {
      const url = new URL(pageUrl);
      // A citation should remain stable and must not carry tracking values or
      // client-only fragment state copied from the current browser tab.
      url.search = '';
      url.hash = '';
      return url.href;
    } catch {
      return pageUrl;
    }
  }, [pageUrl]);

  const citationText = useMemo(
    () =>
      report
        ? formatAgentReportCitation({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const apaText = useMemo(
    () =>
      report
        ? formatAgentReportApa({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const chicagoText = useMemo(
    () =>
      report
        ? formatAgentReportChicago({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const mlaText = useMemo(
    () =>
      report
        ? formatAgentReportMla({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const ieeeText = useMemo(
    () =>
      report
        ? formatAgentReportIeee({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const bundleText = useMemo(
    () =>
      report
        ? formatAgentReportCitationBundle({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const bibtexText = useMemo(
    () =>
      report
        ? formatAgentReportBibtex({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const risText = useMemo(
    () =>
      report
        ? formatAgentReportRis({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

  const cslJsonText = useMemo(
    () =>
      report
        ? formatAgentReportCslJson({
            title: report.title,
            question: report.question,
            url: citationUrl,
            sharedAt: report.sharedAt,
          })
        : '',
    [citationUrl, report],
  );

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
    if (citationCopyStatus === 'idle') return;
    const hold = citationCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setCitationCopyStatus('idle');
      setCitationCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [citationCopyStatus]);

  useEffect(() => {
    if (bundleCopyStatus === 'idle') return;
    const hold = bundleCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setBundleCopyStatus('idle');
      setBundleCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [bundleCopyStatus]);

  useEffect(() => {
    if (bibtexCopyStatus === 'idle') return;
    const hold = bibtexCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setBibtexCopyStatus('idle');
      setBibtexCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [bibtexCopyStatus]);

  useEffect(() => {
    if (cslJsonCopyStatus === 'idle') return;
    const hold = cslJsonCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setCslJsonCopyStatus('idle');
      setCslJsonCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [cslJsonCopyStatus]);

  useEffect(() => {
    if (apaCopyStatus === 'idle') return;
    const hold = apaCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setApaCopyStatus('idle');
      setApaCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [apaCopyStatus]);

  useEffect(() => {
    if (chicagoCopyStatus === 'idle') return;
    const hold = chicagoCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setChicagoCopyStatus('idle');
      setChicagoCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [chicagoCopyStatus]);

  useEffect(() => {
    if (mlaCopyStatus === 'idle') return;
    const hold = mlaCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setMlaCopyStatus('idle');
      setMlaCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [mlaCopyStatus]);

  useEffect(() => {
    if (ieeeCopyStatus === 'idle') return;
    const hold = ieeeCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setIeeeCopyStatus('idle');
      setIeeeCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [ieeeCopyStatus]);

  useEffect(() => {
    if (risCopyStatus === 'idle') return;
    const hold = risCopyStatus === 'failed' ? 2800 : 1600;
    const t = window.setTimeout(() => {
      setRisCopyStatus('idle');
      setRisCopyError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [risCopyStatus]);

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
    if (apaDownloadStatus === 'idle') return;
    const hold = apaDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setApaDownloadStatus('idle');
      setApaDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [apaDownloadFeedbackKey, apaDownloadStatus]);

  useEffect(() => {
    if (chicagoDownloadStatus === 'idle') return;
    const hold = chicagoDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setChicagoDownloadStatus('idle');
      setChicagoDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [chicagoDownloadFeedbackKey, chicagoDownloadStatus]);

  useEffect(() => {
    if (ieeeDownloadStatus === 'idle') return;
    const hold = ieeeDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setIeeeDownloadStatus('idle');
      setIeeeDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [ieeeDownloadFeedbackKey, ieeeDownloadStatus]);

  useEffect(() => {
    if (bundleDownloadStatus === 'idle') return;
    const hold = bundleDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setBundleDownloadStatus('idle');
      setBundleDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [bundleDownloadFeedbackKey, bundleDownloadStatus]);

  useEffect(() => {
    if (bibtexDownloadStatus === 'idle') return;
    const hold = bibtexDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setBibtexDownloadStatus('idle');
      setBibtexDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [bibtexDownloadFeedbackKey, bibtexDownloadStatus]);

  useEffect(() => {
    if (risDownloadStatus === 'idle') return;
    const hold = risDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setRisDownloadStatus('idle');
      setRisDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [risDownloadFeedbackKey, risDownloadStatus]);

  useEffect(() => {
    if (cslJsonDownloadStatus === 'idle') return;
    const hold = cslJsonDownloadStatus === 'failed' ? 2800 : 2000;
    const t = window.setTimeout(() => {
      setCslJsonDownloadStatus('idle');
      setCslJsonDownloadError(null);
    }, hold);
    return () => window.clearTimeout(t);
  }, [cslJsonDownloadFeedbackKey, cslJsonDownloadStatus]);

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

  const handleCopyCitation = async () => {
    if (citationCopyBusyRef.current || !citationText) return;
    citationCopyBusyRef.current = true;
    setCitationCopyInFlight(true);
    const requestId = ++citationCopyRequestRef.current;
    setCitationCopyStatus('idle');
    setCitationCopyError(null);
    try {
      const ok = await copyToClipboard(citationText);
      if (citationCopyRequestRef.current !== requestId) return;
      if (ok) {
        setCitationCopyStatus('copied');
      } else {
        setCitationCopyStatus('failed');
        setCitationCopyError('Could not copy the citation — copy it manually instead.');
      }
    } catch {
      if (citationCopyRequestRef.current !== requestId) return;
      setCitationCopyStatus('failed');
      setCitationCopyError('Could not copy the citation — copy it manually instead.');
    } finally {
      if (citationCopyRequestRef.current === requestId) {
        citationCopyBusyRef.current = false;
        setCitationCopyInFlight(false);
      }
    }
  };

  const handleCopyCitationBundle = async () => {
    if (bundleCopyBusyRef.current || !bundleText) return;
    bundleCopyBusyRef.current = true;
    setBundleCopyInFlight(true);
    const requestId = ++bundleCopyRequestRef.current;
    setBundleCopyStatus('idle');
    setBundleCopyError(null);
    try {
      const ok = await copyToClipboard(bundleText);
      if (bundleCopyRequestRef.current !== requestId) return;
      if (ok) {
        setBundleCopyStatus('copied');
      } else {
        setBundleCopyStatus('failed');
        setBundleCopyError('Could not copy the citation bundle — copy each style instead.');
      }
    } catch {
      if (bundleCopyRequestRef.current !== requestId) return;
      setBundleCopyStatus('failed');
      setBundleCopyError('Could not copy the citation bundle — copy each style instead.');
    } finally {
      if (bundleCopyRequestRef.current === requestId) {
        bundleCopyBusyRef.current = false;
        setBundleCopyInFlight(false);
      }
    }
  };

  const handleCopyBibtex = async () => {
    if (bibtexCopyBusyRef.current || !bibtexText) return;
    bibtexCopyBusyRef.current = true;
    setBibtexCopyInFlight(true);
    const requestId = ++bibtexCopyRequestRef.current;
    setBibtexCopyStatus('idle');
    setBibtexCopyError(null);
    try {
      const ok = await copyToClipboard(bibtexText);
      if (bibtexCopyRequestRef.current !== requestId) return;
      if (ok) {
        setBibtexCopyStatus('copied');
      } else {
        setBibtexCopyStatus('failed');
        setBibtexCopyError('Could not copy the BibTeX citation — copy it manually instead.');
      }
    } catch {
      if (bibtexCopyRequestRef.current !== requestId) return;
      setBibtexCopyStatus('failed');
      setBibtexCopyError('Could not copy the BibTeX citation — copy it manually instead.');
    } finally {
      if (bibtexCopyRequestRef.current === requestId) {
        bibtexCopyBusyRef.current = false;
        setBibtexCopyInFlight(false);
      }
    }
  };

  const handleCopyCslJson = async () => {
    if (cslJsonCopyBusyRef.current || !cslJsonText) return;
    cslJsonCopyBusyRef.current = true;
    setCslJsonCopyInFlight(true);
    const requestId = ++cslJsonCopyRequestRef.current;
    setCslJsonCopyStatus('idle');
    setCslJsonCopyError(null);
    try {
      const ok = await copyJsonToClipboard(cslJsonText);
      if (cslJsonCopyRequestRef.current !== requestId) return;
      if (ok) {
        setCslJsonCopyStatus('copied');
      } else {
        setCslJsonCopyStatus('failed');
        setCslJsonCopyError('Could not copy the CSL-JSON citation — try Download .csl.json instead.');
      }
    } catch {
      if (cslJsonCopyRequestRef.current !== requestId) return;
      setCslJsonCopyStatus('failed');
      setCslJsonCopyError('Could not copy the CSL-JSON citation — try Download .csl.json instead.');
    } finally {
      if (cslJsonCopyRequestRef.current === requestId) {
        cslJsonCopyBusyRef.current = false;
        setCslJsonCopyInFlight(false);
      }
    }
  };

  const handleCopyApa = async () => {
    if (apaCopyBusyRef.current || !apaText) return;
    apaCopyBusyRef.current = true;
    setApaCopyInFlight(true);
    const requestId = ++apaCopyRequestRef.current;
    setApaCopyStatus('idle');
    setApaCopyError(null);
    try {
      const ok = await copyToClipboard(apaText);
      if (apaCopyRequestRef.current !== requestId) return;
      if (ok) {
        setApaCopyStatus('copied');
      } else {
        setApaCopyStatus('failed');
        setApaCopyError('Could not copy the APA citation — copy it manually instead.');
      }
    } catch {
      if (apaCopyRequestRef.current !== requestId) return;
      setApaCopyStatus('failed');
      setApaCopyError('Could not copy the APA citation — copy it manually instead.');
    } finally {
      if (apaCopyRequestRef.current === requestId) {
        apaCopyBusyRef.current = false;
        setApaCopyInFlight(false);
      }
    }
  };

  const handleCopyChicago = async () => {
    if (chicagoCopyBusyRef.current || !chicagoText) return;
    chicagoCopyBusyRef.current = true;
    setChicagoCopyInFlight(true);
    const requestId = ++chicagoCopyRequestRef.current;
    setChicagoCopyStatus('idle');
    setChicagoCopyError(null);
    try {
      const ok = await copyToClipboard(chicagoText);
      if (chicagoCopyRequestRef.current !== requestId) return;
      if (ok) {
        setChicagoCopyStatus('copied');
      } else {
        setChicagoCopyStatus('failed');
        setChicagoCopyError('Could not copy the Chicago citation — copy it manually instead.');
      }
    } catch {
      if (chicagoCopyRequestRef.current !== requestId) return;
      setChicagoCopyStatus('failed');
      setChicagoCopyError('Could not copy the Chicago citation — copy it manually instead.');
    } finally {
      if (chicagoCopyRequestRef.current === requestId) {
        chicagoCopyBusyRef.current = false;
        setChicagoCopyInFlight(false);
      }
    }
  };

  const handleCopyMla = async () => {
    if (mlaCopyBusyRef.current || !mlaText) return;
    mlaCopyBusyRef.current = true;
    setMlaCopyInFlight(true);
    const requestId = ++mlaCopyRequestRef.current;
    setMlaCopyStatus('idle');
    setMlaCopyError(null);
    try {
      const ok = await copyToClipboard(mlaText);
      if (mlaCopyRequestRef.current !== requestId) return;
      if (ok) {
        setMlaCopyStatus('copied');
      } else {
        setMlaCopyStatus('failed');
        setMlaCopyError('Could not copy the MLA citation — copy it manually instead.');
      }
    } catch {
      if (mlaCopyRequestRef.current !== requestId) return;
      setMlaCopyStatus('failed');
      setMlaCopyError('Could not copy the MLA citation — copy it manually instead.');
    } finally {
      if (mlaCopyRequestRef.current === requestId) {
        mlaCopyBusyRef.current = false;
        setMlaCopyInFlight(false);
      }
    }
  };

  const handleCopyIeee = async () => {
    if (ieeeCopyBusyRef.current || !ieeeText) return;
    ieeeCopyBusyRef.current = true;
    setIeeeCopyInFlight(true);
    const requestId = ++ieeeCopyRequestRef.current;
    setIeeeCopyStatus('idle');
    setIeeeCopyError(null);
    try {
      const ok = await copyToClipboard(ieeeText);
      if (ieeeCopyRequestRef.current !== requestId) return;
      if (ok) {
        setIeeeCopyStatus('copied');
      } else {
        setIeeeCopyStatus('failed');
        setIeeeCopyError('Could not copy the IEEE citation — copy it manually instead.');
      }
    } catch {
      if (ieeeCopyRequestRef.current !== requestId) return;
      setIeeeCopyStatus('failed');
      setIeeeCopyError('Could not copy the IEEE citation — copy it manually instead.');
    } finally {
      if (ieeeCopyRequestRef.current === requestId) {
        ieeeCopyBusyRef.current = false;
        setIeeeCopyInFlight(false);
      }
    }
  };

  const handleCopyRis = async () => {
    if (risCopyBusyRef.current || !risText) return;
    risCopyBusyRef.current = true;
    setRisCopyInFlight(true);
    const requestId = ++risCopyRequestRef.current;
    setRisCopyStatus('idle');
    setRisCopyError(null);
    try {
      const ok = await copyToClipboard(risText);
      if (risCopyRequestRef.current !== requestId) return;
      if (ok) {
        setRisCopyStatus('copied');
      } else {
        setRisCopyStatus('failed');
        setRisCopyError('Could not copy the RIS citation — try Download .ris instead.');
      }
    } catch {
      if (risCopyRequestRef.current !== requestId) return;
      setRisCopyStatus('failed');
      setRisCopyError('Could not copy the RIS citation — try Download .ris instead.');
    } finally {
      if (risCopyRequestRef.current === requestId) {
        risCopyBusyRef.current = false;
        setRisCopyInFlight(false);
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

  const handleDownloadBibtex = () => {
    if (!report || !bibtexText) return;
    setBibtexDownloadError(null);
    // Bump the key so repeated synchronous downloads restart their feedback
    // window even when the status remains "done".
    setBibtexDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadBibtexFile(bibtexText, stem);
    if (ok) {
      setBibtexDownloadStatus('done');
    } else {
      setBibtexDownloadStatus('failed');
      setBibtexDownloadError('Could not download the BibTeX citation — try Copy BibTeX instead.');
    }
  };

  const handleDownloadApa = () => {
    if (!report || !apaText) return;
    setApaDownloadError(null);
    setApaDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}-apa`;
    const ok = downloadApaFile(apaText, stem);
    if (ok) {
      setApaDownloadStatus('done');
    } else {
      setApaDownloadStatus('failed');
      setApaDownloadError('Could not download the APA citation — try Copy APA instead.');
    }
  };

  const handleDownloadChicago = () => {
    if (!report || !chicagoText) return;
    setChicagoDownloadError(null);
    setChicagoDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}-chicago`;
    const ok = downloadChicagoFile(chicagoText, stem);
    if (ok) {
      setChicagoDownloadStatus('done');
    } else {
      setChicagoDownloadStatus('failed');
      setChicagoDownloadError('Could not download the Chicago citation — try Copy Chicago instead.');
    }
  };

  const handleDownloadIeee = () => {
    if (!report || !ieeeText) return;
    setIeeeDownloadError(null);
    setIeeeDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}-ieee`;
    const ok = downloadIeeeFile(ieeeText, stem);
    if (ok) {
      setIeeeDownloadStatus('done');
    } else {
      setIeeeDownloadStatus('failed');
      setIeeeDownloadError('Could not download the IEEE citation — try Copy IEEE instead.');
    }
  };

  const handleDownloadCitationBundle = () => {
    if (!report || !bundleText) return;
    setBundleDownloadError(null);
    // Restart the feedback timer for repeated synchronous downloads.
    setBundleDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}-all`;
    const ok = downloadCitationBundleFile(bundleText, stem);
    if (ok) {
      setBundleDownloadStatus('done');
    } else {
      setBundleDownloadStatus('failed');
      setBundleDownloadError('Could not download the citation bundle — try Copy all citations instead.');
    }
  };

  const handleDownloadRis = () => {
    if (!report || !risText) return;
    setRisDownloadError(null);
    // Restart the feedback timer for repeated synchronous downloads.
    setRisDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadRisFile(risText, stem);
    if (ok) {
      setRisDownloadStatus('done');
    } else {
      setRisDownloadStatus('failed');
      setRisDownloadError('Could not download the RIS citation — try Download .bib instead.');
    }
  };

  const handleDownloadCslJson = () => {
    if (!report || !cslJsonText) return;
    setCslJsonDownloadError(null);
    setCslJsonDownloadFeedbackKey((current) => current + 1);
    const stem = `agent-share-citation-${(report.title || report.question || 'report').slice(0, 40)}`;
    const ok = downloadCslJsonFile(cslJsonText, stem);
    if (ok) {
      setCslJsonDownloadStatus('done');
    } else {
      setCslJsonDownloadStatus('failed');
      setCslJsonDownloadError('Could not download the CSL-JSON citation — try Copy CSL-JSON instead.');
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
                  {bibtexCopyError ? (
                    <p className="share-take__error" role="alert">
                      {bibtexCopyError}
                    </p>
                  ) : null}
                  {cslJsonCopyError ? (
                    <p className="share-take__error" role="alert">
                      {cslJsonCopyError}
                    </p>
                  ) : null}
                  {citationCopyError ? (
                    <p className="share-take__error" role="alert">
                      {citationCopyError}
                    </p>
                  ) : null}
                  {bundleCopyError ? (
                    <p className="share-take__error" role="alert">
                      {bundleCopyError}
                    </p>
                  ) : null}
                  {apaCopyError ? (
                    <p className="share-take__error" role="alert">
                      {apaCopyError}
                    </p>
                  ) : null}
                  {chicagoCopyError ? (
                    <p className="share-take__error" role="alert">
                      {chicagoCopyError}
                    </p>
                  ) : null}
                  {mlaCopyError ? (
                    <p className="share-take__error" role="alert">
                      {mlaCopyError}
                    </p>
                  ) : null}
                  {ieeeCopyError ? (
                    <p className="share-take__error" role="alert">
                      {ieeeCopyError}
                    </p>
                  ) : null}
                  {risCopyError ? (
                    <p className="share-take__error" role="alert">
                      {risCopyError}
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
                  {apaDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {apaDownloadError}
                    </p>
                  ) : null}
                  {chicagoDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {chicagoDownloadError}
                    </p>
                  ) : null}
                  {ieeeDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {ieeeDownloadError}
                    </p>
                  ) : null}
                  {bundleDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {bundleDownloadError}
                    </p>
                  ) : null}
                  {bibtexDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {bibtexDownloadError}
                    </p>
                  ) : null}
                  {risDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {risDownloadError}
                    </p>
                  ) : null}
                  {cslJsonDownloadError ? (
                    <p className="share-take__error" role="alert">
                      {cslJsonDownloadError}
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
                      className={`arena-btn arena-btn--secondary arena-btn--sm${citationCopyStatus === 'copied' ? ' is-success' : ''}${citationCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyCitation()}
                      disabled={citationCopyInFlight}
                    >
                      {citationCopyInFlight
                        ? 'Copying…'
                        : citationCopyStatus === 'copied'
                          ? 'Citation copied'
                          : citationCopyStatus === 'failed'
                            ? 'Copy citation failed'
                        : 'Copy citation'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${bundleCopyStatus === 'copied' ? ' is-success' : ''}${bundleCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyCitationBundle()}
                      disabled={bundleCopyInFlight}
                    >
                      {bundleCopyInFlight
                        ? 'Copying…'
                        : bundleCopyStatus === 'copied'
                          ? 'All citations copied'
                          : bundleCopyStatus === 'failed'
                            ? 'Copy all failed'
                            : 'Copy all citations'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${apaCopyStatus === 'copied' ? ' is-success' : ''}${apaCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyApa()}
                      disabled={apaCopyInFlight}
                    >
                      {apaCopyInFlight
                        ? 'Copying…'
                        : apaCopyStatus === 'copied'
                          ? 'APA copied'
                          : apaCopyStatus === 'failed'
                            ? 'Copy APA failed'
                        : 'Copy APA'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${apaDownloadStatus === 'done' ? ' is-success' : ''}${apaDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadApa}
                    >
                      {apaDownloadStatus === 'done'
                        ? 'APA downloaded'
                        : apaDownloadStatus === 'failed'
                          ? 'APA download failed'
                          : 'Download APA'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${chicagoCopyStatus === 'copied' ? ' is-success' : ''}${chicagoCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyChicago()}
                      disabled={chicagoCopyInFlight}
                    >
                      {chicagoCopyInFlight
                        ? 'Copying…'
                        : chicagoCopyStatus === 'copied'
                          ? 'Chicago copied'
                          : chicagoCopyStatus === 'failed'
                            ? 'Copy Chicago failed'
                            : 'Copy Chicago'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${chicagoDownloadStatus === 'done' ? ' is-success' : ''}${chicagoDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadChicago}
                    >
                      {chicagoDownloadStatus === 'done'
                        ? 'Chicago downloaded'
                        : chicagoDownloadStatus === 'failed'
                          ? 'Chicago download failed'
                          : 'Download Chicago'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${mlaCopyStatus === 'copied' ? ' is-success' : ''}${mlaCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyMla()}
                      disabled={mlaCopyInFlight}
                    >
                      {mlaCopyInFlight
                        ? 'Copying…'
                        : mlaCopyStatus === 'copied'
                          ? 'MLA copied'
                          : mlaCopyStatus === 'failed'
                            ? 'Copy MLA failed'
                            : 'Copy MLA'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${ieeeCopyStatus === 'copied' ? ' is-success' : ''}${ieeeCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyIeee()}
                      disabled={ieeeCopyInFlight}
                    >
                      {ieeeCopyInFlight
                        ? 'Copying…'
                        : ieeeCopyStatus === 'copied'
                          ? 'IEEE copied'
                          : ieeeCopyStatus === 'failed'
                            ? 'Copy IEEE failed'
                            : 'Copy IEEE'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${bibtexCopyStatus === 'copied' ? ' is-success' : ''}${bibtexCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyBibtex()}
                      disabled={bibtexCopyInFlight}
                    >
                      {bibtexCopyInFlight
                        ? 'Copying…'
                        : bibtexCopyStatus === 'copied'
                          ? 'BibTeX copied'
                          : bibtexCopyStatus === 'failed'
                            ? 'Copy BibTeX failed'
                          : 'Copy BibTeX'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${risCopyStatus === 'copied' ? ' is-success' : ''}${risCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyRis()}
                      disabled={risCopyInFlight}
                    >
                      {risCopyInFlight
                        ? 'Copying…'
                        : risCopyStatus === 'copied'
                          ? 'RIS copied'
                          : risCopyStatus === 'failed'
                            ? 'Copy RIS failed'
                            : 'Copy RIS'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${cslJsonCopyStatus === 'copied' ? ' is-success' : ''}${cslJsonCopyStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={() => void handleCopyCslJson()}
                      disabled={cslJsonCopyInFlight}
                    >
                      {cslJsonCopyInFlight
                        ? 'Copying…'
                        : cslJsonCopyStatus === 'copied'
                          ? 'CSL-JSON copied'
                          : cslJsonCopyStatus === 'failed'
                            ? 'Copy CSL-JSON failed'
                            : 'Copy CSL-JSON'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${bibtexDownloadStatus === 'done' ? ' is-success' : ''}${bibtexDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadBibtex}
                    >
                      {bibtexDownloadStatus === 'done'
                        ? 'BibTeX downloaded'
                        : bibtexDownloadStatus === 'failed'
                          ? 'BibTeX download failed'
                          : 'Download .bib'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${risDownloadStatus === 'done' ? ' is-success' : ''}${risDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadRis}
                    >
                      {risDownloadStatus === 'done'
                        ? 'RIS downloaded'
                        : risDownloadStatus === 'failed'
                          ? 'RIS download failed'
                          : 'Download .ris'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${cslJsonDownloadStatus === 'done' ? ' is-success' : ''}${cslJsonDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadCslJson}
                    >
                      {cslJsonDownloadStatus === 'done'
                        ? 'CSL-JSON downloaded'
                        : cslJsonDownloadStatus === 'failed'
                          ? 'CSL-JSON download failed'
                          : 'Download .csl.json'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${ieeeDownloadStatus === 'done' ? ' is-success' : ''}${ieeeDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadIeee}
                    >
                      {ieeeDownloadStatus === 'done'
                        ? 'IEEE downloaded'
                        : ieeeDownloadStatus === 'failed'
                          ? 'IEEE download failed'
                          : 'Download IEEE'}
                    </button>
                    <button
                      type="button"
                      className={`arena-btn arena-btn--secondary arena-btn--sm${bundleDownloadStatus === 'done' ? ' is-success' : ''}${bundleDownloadStatus === 'failed' ? ' is-error' : ''}`}
                      onClick={handleDownloadCitationBundle}
                    >
                      {bundleDownloadStatus === 'done'
                        ? 'All citations downloaded'
                        : bundleDownloadStatus === 'failed'
                          ? 'Bundle download failed'
                          : 'Download all citations'}
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
                    {citationCopyStatus === 'copied' ? 'Citation copied to clipboard. ' : ''}
                    {bundleCopyStatus === 'copied' ? 'APA, Chicago, IEEE, and MLA citations copied. ' : ''}
                    {apaCopyStatus === 'copied' ? 'APA citation copied to clipboard. ' : ''}
                    {chicagoCopyStatus === 'copied' ? 'Chicago citation copied to clipboard. ' : ''}
                    {mlaCopyStatus === 'copied' ? 'MLA citation copied to clipboard. ' : ''}
                    {ieeeCopyStatus === 'copied' ? 'IEEE citation copied to clipboard. ' : ''}
                    {bibtexCopyStatus === 'copied' ? 'BibTeX citation copied to clipboard. ' : ''}
                    {cslJsonCopyStatus === 'copied' ? 'CSL-JSON citation copied to clipboard. ' : ''}
                    {sourceCopyStatus === 'copied' ? 'Sources copied to clipboard. ' : ''}
                    {linkStatus === 'copied' ? 'Link copied to clipboard. ' : ''}
                    {downloadStatus === 'done' ? 'Report downloaded as markdown.' : ''}
                    {jsonDownloadStatus === 'done' ? 'Report downloaded as JSON.' : ''}
                    {apaDownloadStatus === 'done' ? 'APA citation downloaded.' : ''}
                    {chicagoDownloadStatus === 'done' ? 'Chicago citation downloaded.' : ''}
                    {ieeeDownloadStatus === 'done' ? 'IEEE citation downloaded.' : ''}
                    {bundleDownloadStatus === 'done' ? 'Citation bundle downloaded.' : ''}
                    {bibtexDownloadStatus === 'done' ? 'BibTeX citation downloaded.' : ''}
                    {risDownloadStatus === 'done' ? 'RIS citation downloaded.' : ''}
                    {cslJsonDownloadStatus === 'done' ? 'CSL-JSON citation downloaded.' : ''}
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
