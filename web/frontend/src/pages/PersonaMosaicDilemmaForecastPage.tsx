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
  appendMosaicDilemmaForecastDecision,
  buildMosaicDilemmaForecast,
  clearMosaicDilemmaForecastCounter,
  clearMosaicDilemmaForecastDecisions,
  incrementMosaicDilemmaForecastCounter,
  mosaicDilemmaForecastMajorityInfo,
  mosaicDilemmaForecastShareUrl,
  mosaicDilemmaForecastValid,
  mosaicDilemmaForecastWinTally,
  readMosaicDilemmaForecastCounter,
  readMosaicDilemmaForecastDecisions,
  type MosaicDilemmaForecastDecisionEntry,
  type PersonaMosaicDilemmaForecast,
} from '../data/personaMosaicDilemmaForecast';
import { PERSONAS } from '../data/personas';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-dilemma-forecast-page.css';

const MAX_DILEMMA_CHARS = 200;
const HISTORY_KEY = 'arena:persona-mosaic-dilemma-forecast:history:v1';
const HISTORY_LIMIT = 6;

// Trim a dilemma to a 40-char snippet, with "..." if it was longer.
// Used twice (history entry + decision log) — extract once so the
// truncation rule lives in one place.
function snippetDilemma(s: string): string {
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_FORECASTS: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'Career paths',
    a: 'Take the safe job — predictable, well-paid, low upside.',
    b: 'Take the risky startup — uncertain, low-paid, high upside.',
  },
  {
    label: 'Communication',
    a: 'Tell them the hard truth now, even if it stings.',
    b: 'Let them figure it out — they will, on their own timeline.',
  },
  {
    label: 'Strategic moves',
    a: 'Specialize — go deep and own the niche.',
    b: 'Stay generalist — keep options and adapt fast.',
  },
  {
    label: 'Personal trade-offs',
    a: 'Optimize for more money now, more flexibility later.',
    b: 'Optimize for more time now, more money later.',
  },
];

export function PersonaMosaicDilemmaForecastPage() {
  const navigate = useNavigate();
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
  const [decisions, setDecisions] = useState<ReadonlyArray<MosaicDilemmaForecastDecisionEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readMosaicDilemmaForecastCounter());
    setDecisions(readMosaicDilemmaForecastDecisions());
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const forecast: PersonaMosaicDilemmaForecast | null = useMemo(() => {
    if (!dilemmaA.trim() || !dilemmaB.trim()) return null;
    const f = buildMosaicDilemmaForecast(dilemmaA, dilemmaB);
    return mosaicDilemmaForecastValid(f) ? f : null;
  }, [dilemmaA, dilemmaB]);

  const lifetimeTally = useMemo(
    () => mosaicDilemmaForecastWinTally(decisions),
    [decisions],
  );

  const majority = useMemo(
    () => (forecast ? mosaicDilemmaForecastMajorityInfo(forecast.tally, forecast.winner) : null),
    [forecast],
  );

  const onForecast = () => {
    const url = mosaicDilemmaForecastShareUrl(
      window.location.origin,
      dilemmaA,
      dilemmaB,
    );
    window.history.replaceState({}, '', url);
    try {
      const snippetA = snippetDilemma(dilemmaA);
      const snippetB = snippetDilemma(dilemmaB);
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, HISTORY_LIMIT);
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    if (forecast) {
      const decision: MosaicDilemmaForecastDecisionEntry = {
        // Date.now() alone can collide when a user double-clicks the
        // forecast button in the same millisecond — the dedup-by-id
        // branch would silently drop the second decision. Append a
        // 6-hex random suffix so back-to-back appends always win a
        // unique id.
        id: `mdf-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        dilemmaASnippet: snippetDilemma(dilemmaA),
        dilemmaBSnippet: snippetDilemma(dilemmaB),
        winner: forecast.winner,
        savedAt: new Date().toISOString(),
      };
      appendMosaicDilemmaForecastDecision(decision);
      setDecisions(readMosaicDilemmaForecastDecisions());
    }
    const c = incrementMosaicDilemmaForecastCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearMosaicDilemmaForecastCounter();
    clearMosaicDilemmaForecastDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setDilemmaA('');
    setDilemmaB('');
    const url = mosaicDilemmaForecastShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setDilemmaA(sample.a);
    setDilemmaB(sample.b);
    const url = mosaicDilemmaForecastShareUrl(
      window.location.origin,
      sample.a,
      sample.b,
    );
    window.history.replaceState({}, '', url);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !forecast) return;
    const url = mosaicDilemmaForecastShareUrl(
      window.location.origin,
      dilemmaA,
      dilemmaB,
    );
    const winnerLabel = forecast.winner === 'A' ? 'Dilemma A' : 'Dilemma B';
    const winnerCount = forecast.winner === 'A' ? forecast.tally.a : forecast.tally.b;
    const text = `Arena Mosaic Dilemma Forecast: 8 Arena minds picked ${winnerLabel} (${winnerCount} of 8). Same dilemma pair in = same verdict. Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Dilemma Forecast', text, url });
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
    // /app is a ProtectedRoute; ProtectedRoute will redirect to
    // /signin when the user is unauthenticated, so the call site
    // does not need to branch on isAuthenticated.
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setDilemmaA(entry.a);
    setDilemmaB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pmdf-page${pageVisible ? ' pmdf-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmdf-main${reduceMotion ? '' : ' pmdf-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmdf-title"
      >
        <section className="pmdf-hero">
          <p className="pmdf-hero__eyebrow">
            <Sparkles aria-hidden="true" /> Persona Mosaic Dilemma Forecast
          </p>
          <h1 id="pmdf-title" className="pmdf-hero__title">
            <span>Two dilemma framings.</span>
            <span className="pmdf-hero__title-accent">Eight minds judge.</span>
            <span>One is sharper.</span>
          </h1>
          <p className="pmdf-hero__lede">
            Two dilemma framings go in, an 8-persona panel picks
            the sharper one. Each mind votes + explains. Same
            dilemma pair in = same verdict, so a shared link
            replays the exact same forecast.
          </p>
        </section>

        <section className="pmdf-input" aria-label="Dilemma input">
          <div className="pmdf-input__row">
            <label className="pmdf-input__field">
              <span className="pmdf-input__label">Dilemma A</span>
              <textarea
                className="pmdf-input__textarea"
                value={dilemmaA}
                onChange={(e) => setDilemmaA(e.target.value)}
                placeholder="Take the safe job..."
                maxLength={MAX_DILEMMA_CHARS}
                rows={3}
                aria-label="Dilemma A"
              />
            </label>
            <span className="pmdf-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pmdf-input__field">
              <span className="pmdf-input__label">Dilemma B</span>
              <textarea
                className="pmdf-input__textarea"
                value={dilemmaB}
                onChange={(e) => setDilemmaB(e.target.value)}
                placeholder="Take the risky startup..."
                maxLength={MAX_DILEMMA_CHARS}
                rows={3}
                aria-label="Dilemma B"
              />
            </label>
          </div>
          <div className="pmdf-input__meta">
            <span>
              {dilemmaA.length + dilemmaB.length}/{MAX_DILEMMA_CHARS * 2} chars total
            </span>
            <div className="pmdf-input__actions">
              <button
                type="button"
                className="pmdf-input__reset"
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
          <div className="pmdf-input__stats" aria-label="Mosaic dilemma forecast stats">
            <div className="pmdf-input__stat">
              <Sparkles aria-hidden="true" />
              <span className="pmdf-input__stat-label">Forecasts cast</span>
              <span className="pmdf-input__stat-value">{castCount}</span>
            </div>
            {lifetimeTally.a > 0 && (
              <div className="pmdf-input__stat pmdf-input__stat--a">
                <span className="pmdf-input__stat-label">A wins</span>
                <span className="pmdf-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {lifetimeTally.b > 0 && (
              <div className="pmdf-input__stat pmdf-input__stat--b">
                <span className="pmdf-input__stat-label">B wins</span>
                <span className="pmdf-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || lifetimeTally.a > 0 || lifetimeTally.b > 0) && (
              <button
                type="button"
                className="pmdf-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset forecasts counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pmdf-samples" aria-label="Sample forecasts">
          <p className="pmdf-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_FORECASTS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmdf-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmdf-sample__label">{sample.label}</span>
                  <span className="pmdf-sample__matchup">
                    <span className="pmdf-sample__half">"{sample.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmdf-sample__half">"{sample.b}"</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {forecast && (
          <section className="pmdf-result" aria-label="Mosaic dilemma forecast result">
            <header className="pmdf-result__head">
              <p className="pmdf-result__kicker">
                <Sparkles aria-hidden="true" /> The 8-mind panel has chosen
              </p>
              <h2 className="pmdf-result__winner">
                <span
                  className={`pmdf-result__winner-pill pmdf-result__winner-pill--${forecast.winner.toLowerCase()}`}
                >
                  Dilemma {forecast.winner} is sharper
                </span>
                <span className="pmdf-result__tally">
                  {forecast.tally.a} for A · {forecast.tally.b} for B
                </span>
              </h2>
              {majority && (
                <p className={`pmdf-result__majority pmdf-result__majority--${majority.label}`}>
                  {majority.description}
                </p>
              )}
            </header>

            <div className="pmdf-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pmdf-side pmdf-side--${side.toLowerCase()}${forecast.winner === side ? ' pmdf-side--winner' : ''}`}
                >
                  <p className="pmdf-side__label">Dilemma {side}</p>
                  <blockquote className="pmdf-side__quote">
                    {side === 'A' ? forecast.dilemmaA : forecast.dilemmaB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pmdf-critics">
              {forecast.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pmdf-critic pmdf-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pmdf-persona-color' as string]: persona.color,
                      ['--pmdf-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmdf-critic__head">
                      <span className="pmdf-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pmdf-critic__name">{persona.name}</p>
                        <p className="pmdf-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmdf-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pmdf-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pmdf-result__actions">
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
          <section className="pmdf-history" aria-label="Recent forecasts">
            <div className="pmdf-history__head">
              <p className="pmdf-history__label">
                <History aria-hidden="true" /> Recent forecasts
              </p>
              <button
                type="button"
                className="pmdf-history__clear"
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
                    className="pmdf-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pmdf-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmdf-history__b">B: "{entry.b}"</span>
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
