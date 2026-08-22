import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  History,
  MessageSquare,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Swords,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  SCORE_BAND_LABELS,
  VERDICT_LABELS,
  buildMosaicRoast,
  clearMosaicRoastCounter,
  incrementMosaicRoastCounter,
  mosaicRoastShareUrl,
  mosaicRoastValid,
  readMosaicRoastCounter,
  scoreBand,
  type PersonaMosaicRoast,
} from '../data/personaMosaicRoast';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-roast-page.css';

const MAX_OUTPUT_CHARS = 1500;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_OUTPUTS: ReadonlyArray<{ readonly label: string; readonly output: string }> = [
  {
    label: 'The corporate reply',
    output: 'Thank you for your inquiry. We appreciate your interest in our products and will get back to you within 5-7 business days regarding next steps and onboarding materials.',
  },
  {
    label: 'The hedge',
    output: 'It depends on what you mean. There are many ways to think about this, and reasonable people might disagree. Some say yes, others say no, and the truth is probably somewhere in between.',
  },
  {
    label: 'The confident take',
    output: 'The market is shifting toward AI-native workflows. Companies that adopt early will win, those that wait will fall behind. The next 18 months are the inflection point.',
  },
  {
    label: 'The hedged analysis',
    output: 'On one hand, there are clear benefits to consider. On the other hand, the risks should not be overlooked. A balanced approach may be warranted, depending on the specific circumstances.',
  },
];

export function PersonaMosaicRoastPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialOutput = searchParams.get('o') ?? '';

  const [output, setOutput] = useState(initialOutput);
  const [committed, setCommitted] = useState(initialOutput);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [castCount, setCastCount] = useState(0);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readMosaicRoastCounter());
    try {
      const raw = window.localStorage.getItem('arena:persona-mosaic-roast:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const roast: PersonaMosaicRoast | null = useMemo(() => {
    if (!committed.trim()) return null;
    const r = buildMosaicRoast(committed);
    return mosaicRoastValid(r) ? r : null;
  }, [committed]);

  const band = useMemo(
    () => (roast ? scoreBand(roast.averageScore) : null),
    [roast],
  );

  const onRoast = () => {
    setCommitted(output);
    if (typeof window !== 'undefined') {
      const url = mosaicRoastShareUrl(window.location.origin, output);
      window.history.replaceState({}, '', url);
    }
    try {
      const snippet = output.length > 80 ? `${output.slice(0, 77)}...` : output;
      const next = [
        snippet,
        ...history.filter((s) => s !== snippet),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-mosaic-roast:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    const c = incrementMosaicRoastCounter();
    setCastCount(c);
  };

  const onResetCounter = () => {
    clearMosaicRoastCounter();
    setCastCount(0);
  };

  const onReset = () => {
    setOutput('');
    setCommitted('');
    if (typeof window !== 'undefined') {
      const url = mosaicRoastShareUrl(window.location.origin, '');
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: string) => {
    setOutput(sample);
    setCommitted(sample);
    if (typeof window !== 'undefined') {
      const url = mosaicRoastShareUrl(window.location.origin, sample);
      window.history.replaceState({}, '', url);
    }
  };

  const onReplayHistory = (s: string) => {
    setOutput(s);
    setCommitted(s);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-mosaic-roast:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !roast) return;
    const url = mosaicRoastShareUrl(window.location.origin, committed);
    const text = `Arena Mosaic Roast: 4 Arena minds scored my output ${roast.averageScore}/10 (mostly ${VERDICT_LABELS[roast.dominantVerdict]}). Roast yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Roast', text, url });
        return;
      } catch (err) {
        /* fall through */
      }
    }
    const ok = await copyToClipboard(`${text} ${url}`);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const onTryInArena = () => {
    if (typeof window === 'undefined' || !committed.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Roast this AI output: ${committed}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pmr-page${pageVisible ? ' pmr-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmr-main${reduceMotion ? '' : ' pmr-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmr-title"
      >
        <section className="pmr-hero">
          <p className="pmr-hero__eyebrow">
            <MessageSquare aria-hidden="true" /> Persona Mosaic Roast
          </p>
          <h1 id="pmr-title" className="pmr-hero__title">
            <span>Paste an AI output.</span>
            <span className="pmr-hero__title-accent">Four minds judge it.</span>
          </h1>
          <p className="pmr-hero__lede">
            Drop any AI answer, agent output, or assistant response
            into the input. Four Arena minds critique it from their
            angle and score it 0-10. The same input always produces
            the same verdict — share it, debate it, ship it.
          </p>
        </section>

        <section className="pmr-input" aria-label="Output input">
          <label className="pmr-input__label" htmlFor="pmr-output-input">
            <Sparkles aria-hidden="true" /> The AI output
          </label>
          <textarea
            id="pmr-output-input"
            className="pmr-input__textarea"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="Paste any AI response, agent output, or assistant reply."
            maxLength={MAX_OUTPUT_CHARS}
            rows={6}
            aria-label="AI output to critique"
          />
          <div className="pmr-input__meta">
            <span>
              {output.length}/{MAX_OUTPUT_CHARS} chars
            </span>
            <div className="pmr-input__actions">
              <button
                type="button"
                className="pmr-input__reset"
                onClick={onReset}
                disabled={!output && !committed}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onRoast}
                disabled={!output.trim()}
                icon={<Swords aria-hidden="true" />}
              >
                Roast it
              </MotionButton>
            </div>
          </div>
          <div className="pmr-input__stats" aria-label="Roast stats">
            <div className="pmr-input__stat">
              <Swords aria-hidden="true" />
              <span className="pmr-input__stat-label">Roasts cast</span>
              <span className="pmr-input__stat-value">{castCount}</span>
            </div>
            {castCount > 0 && (
              <button
                type="button"
                className="pmr-input__stat-reset"
                onClick={onResetCounter}
                aria-label="Reset roasts counter"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pmr-samples" aria-label="Sample outputs">
          <p className="pmr-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_OUTPUTS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmr-sample"
                  onClick={() => onLoadSample(sample.output)}
                >
                  <span className="pmr-sample__label">{sample.label}</span>
                  <span className="pmr-sample__output">"{sample.output.slice(0, 80)}{sample.output.length > 80 ? '...' : ''}"</span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {roast && (
          <section className="pmr-result" aria-label="Mosaic roast result">
            <header className="pmr-result__head">
              <p className="pmr-result__kicker">
                <Swords aria-hidden="true" /> The mosaic has judged
              </p>
              <div className="pmr-result__score">
                <span className="pmr-result__score-num">
                  {roast.averageScore}
                </span>
                <span className="pmr-result__score-den">/ 10</span>
                <Star aria-hidden="true" />
              </div>
              <p className="pmr-result__dominant">
                The panel mostly {VERDICT_LABELS[roast.dominantVerdict]}.
              </p>
              <div
                className={`pmr-scale pmr-scale--${band ?? 'mid'}`}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={roast.averageScore}
                aria-label="Average score band"
              >
                <div className="pmr-scale__bar">
                  <div
                    className="pmr-scale__fill"
                    style={{ width: `${roast.averageScore * 10}%` }}
                  />
                  <div
                    className="pmr-scale__mark"
                    style={{ left: `${roast.averageScore * 10}%` }}
                    aria-hidden="true"
                  />
                </div>
                <div className="pmr-scale__labels">
                  <span>0</span>
                  <span>3</span>
                  <span>7</span>
                  <span>10</span>
                </div>
                {band && (
                  <p className="pmr-scale__meaning">
                    {SCORE_BAND_LABELS[band]}
                  </p>
                )}
              </div>
            </header>

            <ul className="pmr-list">
              {roast.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={critique.personaId}
                    className="pmr-card"
                    data-verdict={critique.verdict}
                    style={{
                      ['--pmr-persona-color' as string]: persona.color,
                      ['--pmr-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmr-card__head">
                      <span className="pmr-card__dot" aria-hidden="true" />
                      <div>
                        <p className="pmr-card__name">{persona.name}</p>
                        <p className="pmr-card__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmr-card__score">
                        {critique.score}/10
                      </span>
                    </header>
                    <p className="pmr-card__take">{critique.take}</p>
                    <p
                      className={`pmr-card__verdict pmr-card__verdict--${critique.verdict}`}
                    >
                      {critique.verdict === 'sharp' && (
                        <CheckCircle2 aria-hidden="true" />
                      )}
                      {VERDICT_LABELS[critique.verdict]}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="pmr-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Send to Arena for a real panel
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share score'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pmr-history" aria-label="Recent roasts">
            <div className="pmr-history__head">
              <p className="pmr-history__label">
                <History aria-hidden="true" /> Recent roasts
              </p>
              <button
                type="button"
                className="pmr-history__clear"
                onClick={onClearHistory}
                aria-label="Clear roast history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((s, idx) => (
                <li key={`${idx}-${s.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pmr-history__item"
                    onClick={() => onReplayHistory(s)}
                  >
                    <ArrowRight aria-hidden="true" />
                    <span className="pmr-history__snippet">"{s}"</span>
                  </Pressable>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
