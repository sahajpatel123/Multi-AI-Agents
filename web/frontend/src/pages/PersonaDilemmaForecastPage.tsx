import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  History,
  RotateCcw,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  appendDilemmaForecastDecision,
  buildDilemmaForecast,
  clearDilemmaForecastCounter,
  clearDilemmaForecastDecisions,
  dilemmaForecastMajorityInfo,
  dilemmaForecastShareUrl,
  dilemmaForecastValid,
  dilemmaForecastWinTally,
  incrementDilemmaForecastCounter,
  readDilemmaForecastCounter,
  readDilemmaForecastDecisions,
  type DilemmaForecastDecisionEntry,
  type PersonaDilemmaForecast,
} from '../data/personaDilemmaForecast';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-dilemma-forecast-page.css';

const MAX_DILEMMA_CHARS = 200;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_FORECASTS: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'Career paths',
    a: 'Should I take the safe job or the risky startup?',
    b: 'Should I stay in my current role or pursue a new opportunity?',
  },
  {
    label: 'Communication',
    a: 'Should I tell them the hard truth or let them figure it out?',
    b: 'Should I share this feedback publicly or keep it private?',
  },
  {
    label: 'Strategic moves',
    a: 'Should we specialize or stay generalist?',
    b: 'Should we expand into the new market or focus on our core?',
  },
  {
    label: 'Personal trade-offs',
    a: 'Should I optimize for more money or more time?',
    b: 'Should I invest now or wait for a better opportunity?',
  },
];

export function PersonaDilemmaForecastPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';

  const [dilemmaA, setDilemmaA] = useState(initialA);
  const [dilemmaB, setDilemmaB] = useState(initialB);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<{ a: string; b: string }>>([]);
  const [castCount, setCastCount] = useState(0);
  const [decisions, setDecisions] = useState<ReadonlyArray<DilemmaForecastDecisionEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readDilemmaForecastCounter());
    setDecisions(readDilemmaForecastDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-dilemma-forecast:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const forecast: PersonaDilemmaForecast | null = useMemo(() => {
    if (!dilemmaA.trim() || !dilemmaB.trim()) return null;
    const f = buildDilemmaForecast(dilemmaA, dilemmaB);
    return dilemmaForecastValid(f) ? f : null;
  }, [dilemmaA, dilemmaB]);

  const lifetimeTally = useMemo(
    () => dilemmaForecastWinTally(decisions),
    [decisions],
  );

  const majority = useMemo(
    () => (forecast ? dilemmaForecastMajorityInfo(forecast.tally, forecast.winner) : null),
    [forecast],
  );

  const onForecast = () => {
    const url = dilemmaForecastShareUrl(
      window.location.origin,
      dilemmaA,
      dilemmaB,
    );
    window.history.replaceState({}, '', url);
    try {
      const snippetA = dilemmaA.length > 40 ? `${dilemmaA.slice(0, 37)}...` : dilemmaA;
      const snippetB = dilemmaB.length > 40 ? `${dilemmaB.slice(0, 37)}...` : dilemmaB;
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-dilemma-forecast:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    if (forecast) {
      const decision: DilemmaForecastDecisionEntry = {
        id: `forecast-${Date.now()}`,
        dilemmaASnippet: dilemmaA.length > 40 ? `${dilemmaA.slice(0, 37)}...` : dilemmaA,
        dilemmaBSnippet: dilemmaB.length > 40 ? `${dilemmaB.slice(0, 37)}...` : dilemmaB,
        winner: forecast.winner,
        savedAt: new Date().toISOString(),
      };
      appendDilemmaForecastDecision(decision);
      setDecisions(readDilemmaForecastDecisions());
    }
    const c = incrementDilemmaForecastCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearDilemmaForecastCounter();
    clearDilemmaForecastDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setDilemmaA('');
    setDilemmaB('');
    const url = dilemmaForecastShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setDilemmaA(sample.a);
    setDilemmaB(sample.b);
    const url = dilemmaForecastShareUrl(
      window.location.origin,
      sample.a,
      sample.b,
    );
    window.history.replaceState({}, '', url);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !forecast) return;
    const url = dilemmaForecastShareUrl(
      window.location.origin,
      dilemmaA,
      dilemmaB,
    );
    const winnerLabel = forecast.winner === 'A' ? 'Dilemma A' : 'Dilemma B';
    const winnerCount = forecast.winner === 'A' ? forecast.tally.a : forecast.tally.b;
    const text = `Arena Dilemma Forecast: 4 Arena minds picked ${winnerLabel} (${winnerCount} of 4). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Dilemma Forecast', text, url });
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
    if (typeof window === 'undefined' || !dilemmaA.trim() || !dilemmaB.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Compare these two dilemma framings: A) ${dilemmaA} B) ${dilemmaB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setDilemmaA(entry.a);
    setDilemmaB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-dilemma-forecast:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pdfo-page${pageVisible ? ' pdfo-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pdfo-main${reduceMotion ? '' : ' pdfo-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pdfo-title"
      >
        <section className="pdfo-hero">
          <p className="pdfo-hero__eyebrow">
            <Sparkles aria-hidden="true" /> Persona Dilemma Forecast
          </p>
          <h1 id="pdfo-title" className="pdfo-hero__title">
            <span>Two dilemmas.</span>
            <span className="pdfo-hero__title-accent">Four minds judge.</span>
            <span>One is sharper.</span>
          </h1>
          <p className="pdfo-hero__lede">
            Paste two dilemma framings and a 4-persona panel picks
            the sharper one. Each mind votes + explains. Same
            dilemma pair in = same verdict, so a shared link
            replays the exact same forecast.
          </p>
        </section>

        <section className="pdfo-input" aria-label="Dilemma input">
          <div className="pdfo-input__row">
            <label className="pdfo-input__field">
              <span className="pdfo-input__label">Dilemma A</span>
              <textarea
                className="pdfo-input__textarea"
                value={dilemmaA}
                onChange={(e) => setDilemmaA(e.target.value)}
                placeholder="Paste a dilemma framing..."
                maxLength={MAX_DILEMMA_CHARS}
                rows={3}
                aria-label="Dilemma A"
              />
            </label>
            <span className="pdfo-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pdfo-input__field">
              <span className="pdfo-input__label">Dilemma B</span>
              <textarea
                className="pdfo-input__textarea"
                value={dilemmaB}
                onChange={(e) => setDilemmaB(e.target.value)}
                placeholder="Paste another dilemma framing..."
                maxLength={MAX_DILEMMA_CHARS}
                rows={3}
                aria-label="Dilemma B"
              />
            </label>
          </div>
          <div className="pdfo-input__meta">
            <span>
              {dilemmaA.length + dilemmaB.length}/{MAX_DILEMMA_CHARS * 2} chars total
            </span>
            <div className="pdfo-input__actions">
              <button
                type="button"
                className="pdfo-input__reset"
                onClick={onReset}
                disabled={!dilemmaA && !dilemmaB}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onForecast}
                disabled={!dilemmaA.trim() || !dilemmaB.trim()}
                icon={<Sparkles aria-hidden="true" />}
              >
                Forecast the sharper
              </MotionButton>
            </div>
          </div>
          <div className="pdfo-input__stats" aria-label="Forecast stats">
            <div className="pdfo-input__stat">
              <Sparkles aria-hidden="true" />
              <span className="pdfo-input__stat-label">Forecasts cast</span>
              <span className="pdfo-input__stat-value">{castCount}</span>
            </div>
            {lifetimeTally.a > 0 && (
              <div className="pdfo-input__stat pdfo-input__stat--a">
                <span className="pdfo-input__stat-label">A wins</span>
                <span className="pdfo-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {lifetimeTally.b > 0 && (
              <div className="pdfo-input__stat pdfo-input__stat--b">
                <span className="pdfo-input__stat-label">B wins</span>
                <span className="pdfo-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || lifetimeTally.a > 0 || lifetimeTally.b > 0) && (
              <button
                type="button"
                className="pdfo-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset forecasts counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pdfo-samples" aria-label="Sample forecasts">
          <p className="pdfo-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_FORECASTS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pdfo-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pdfo-sample__label">{sample.label}</span>
                  <span className="pdfo-sample__matchup">
                    <span className="pdfo-sample__half">"{sample.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pdfo-sample__half">"{sample.b}"</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {forecast && (
          <section className="pdfo-result" aria-label="Forecast result">
            <header className="pdfo-result__head">
              <p className="pdfo-result__kicker">
                <Sparkles aria-hidden="true" /> The 4-mind panel has chosen
              </p>
              <h2 className="pdfo-result__winner">
                <span
                  className={`pdfo-result__winner-pill pdfo-result__winner-pill--${forecast.winner.toLowerCase()}`}
                >
                  Dilemma {forecast.winner} is sharper
                </span>
                <span className="pdfo-result__tally">
                  {forecast.tally.a} for A · {forecast.tally.b} for B
                </span>
              </h2>
              {majority && (
                <p className={`pdfo-result__majority pdfo-result__majority--${majority.label}`}>
                  {majority.description}
                </p>
              )}
            </header>

            <div className="pdfo-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pdfo-side pdfo-side--${side.toLowerCase()}${forecast.winner === side ? ' pdfo-side--winner' : ''}`}
                >
                  <p className="pdfo-side__label">Dilemma {side}</p>
                  <blockquote className="pdfo-side__quote">
                    {side === 'A' ? forecast.dilemmaA : forecast.dilemmaB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pdfo-critics">
              {forecast.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pdfo-critic pdfo-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pdfo-persona-color' as string]: persona.color,
                      ['--pdfo-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pdfo-critic__head">
                      <span className="pdfo-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pdfo-critic__name">{persona.name}</p>
                        <p className="pdfo-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pdfo-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pdfo-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pdfo-result__actions">
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
                {copied ? 'Link copied' : 'Share forecast'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pdfo-history" aria-label="Recent forecasts">
            <div className="pdfo-history__head">
              <p className="pdfo-history__label">
                <History aria-hidden="true" /> Recent forecasts
              </p>
              <button
                type="button"
                className="pdfo-history__clear"
                onClick={onClearHistory}
                aria-label="Clear forecast history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((entry, idx) => (
                <li key={`${idx}-${entry.a.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pdfo-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pdfo-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pdfo-history__b">B: "{entry.b}"</span>
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