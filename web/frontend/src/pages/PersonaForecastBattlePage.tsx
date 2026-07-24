import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Crown,
  History,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
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
  appendForecastBattleDecision,
  buildForecastBattle,
  clearForecastBattleCounter,
  clearForecastBattleDecisions,
  forecastBattleShareUrl,
  forecastBattleValid,
  forecastBattleWinTally,
  incrementForecastBattleCounter,
  readForecastBattleCounter,
  readForecastBattleDecisions,
  type ForecastBattleDecisionEntry,
  type PersonaForecastBattle,
} from '../data/personaForecastBattle';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-forecast-battle-page.css';

const MAX_SCENARIO_CHARS = 120;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_BATTLES: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'AI in 5 years',
    a: 'AI in 5 years — mostly commoditized',
    b: 'AI in 5 years — mostly concentrated',
  },
  {
    label: 'Remote work in 3 years',
    a: 'Remote work in 3 years — fully distributed',
    b: 'Remote work in 3 years — hybrid dominant',
  },
  {
    label: 'Climate in 20 years',
    a: 'Climate in 20 years — tech adaptation wins',
    b: 'Climate in 20 years — policy adaptation wins',
  },
  {
    label: 'Crypto in 5 years',
    a: 'Crypto in 5 years — mainstream currency',
    b: 'Crypto in 5 years — niche asset class',
  },
];

export function PersonaForecastBattlePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';

  const [scenarioA, setScenarioA] = useState(initialA);
  const [scenarioB, setScenarioB] = useState(initialB);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<{ a: string; b: string }>>([]);
  const [castCount, setCastCount] = useState(0);
  const [decisions, setDecisions] = useState<ReadonlyArray<ForecastBattleDecisionEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readForecastBattleCounter());
    setDecisions(readForecastBattleDecisions());
    try {
      const raw = window.localStorage.getItem('arena:persona-forecast-battle:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const battle: PersonaForecastBattle | null = useMemo(() => {
    if (!scenarioA.trim() || !scenarioB.trim()) return null;
    const b = buildForecastBattle(scenarioA, scenarioB);
    return forecastBattleValid(b) ? b : null;
  }, [scenarioA, scenarioB]);

  const lifetimeTally = useMemo(
    () => forecastBattleWinTally(decisions),
    [decisions],
  );

  const onBattle = () => {
    if (typeof window === 'undefined') return;
    const url = forecastBattleShareUrl(window.location.origin, scenarioA, scenarioB);
    window.history.replaceState({}, '', url);
    try {
      const snippetA = scenarioA.length > 40 ? `${scenarioA.slice(0, 37)}...` : scenarioA;
      const snippetB = scenarioB.length > 40 ? `${scenarioB.slice(0, 37)}...` : scenarioB;
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-forecast-battle:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    if (battle) {
      const decision: ForecastBattleDecisionEntry = {
        id: `battle-${Date.now()}`,
        scenarioASnippet: scenarioA.length > 40 ? `${scenarioA.slice(0, 37)}...` : scenarioA,
        scenarioBSnippet: scenarioB.length > 40 ? `${scenarioB.slice(0, 37)}...` : scenarioB,
        winner: battle.winner,
        savedAt: new Date().toISOString(),
      };
      appendForecastBattleDecision(decision);
      setDecisions(readForecastBattleDecisions());
    }
    const c = incrementForecastBattleCounter();
    setCastCount(c);
  };

  const onResetLifetime = () => {
    clearForecastBattleCounter();
    clearForecastBattleDecisions();
    setCastCount(0);
    setDecisions([]);
  };

  const onReset = () => {
    setScenarioA('');
    setScenarioB('');
    if (typeof window !== 'undefined') {
      const url = forecastBattleShareUrl(window.location.origin, '', '');
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setScenarioA(sample.a);
    setScenarioB(sample.b);
    if (typeof window !== 'undefined') {
      const url = forecastBattleShareUrl(window.location.origin, sample.a, sample.b);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !battle) return;
    const url = forecastBattleShareUrl(window.location.origin, scenarioA, scenarioB);
    const winnerLabel = battle.winner === 'A' ? 'Scenario A' : 'Scenario B';
    const text = `Arena Forecast Battle: 4 Arena minds picked ${winnerLabel}. Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Forecast Battle', text, url });
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
    if (typeof window === 'undefined' || !scenarioA.trim() || !scenarioB.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Forecast: which is more likely — A) ${scenarioA} B) ${scenarioB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setScenarioA(entry.a);
    setScenarioB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-forecast-battle:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pfb-page${pageVisible ? ' pfb-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pfb-main${reduceMotion ? '' : ' pfb-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pfb-title"
      >
        <section className="pfb-hero">
          <p className="pfb-hero__eyebrow">
            <Swords aria-hidden="true" /> Persona Forecast Battle
          </p>
          <h1 id="pfb-title" className="pfb-hero__title">
            <span>Two futures.</span>
            <span className="pfb-hero__title-accent">Four minds pick.</span>
            <span>One wins.</span>
          </h1>
          <p className="pfb-hero__lede">
            Name two possible futures. The panel picks which is
            more likely + explains why. Same pair in = same verdict,
            so a shared link replays the exact same forecast battle.
          </p>
        </section>

        <section className="pfb-input" aria-label="Battle input">
          <div className="pfb-input__row">
            <label className="pfb-input__field">
              <span className="pfb-input__label">Scenario A</span>
              <input
                type="text"
                className="pfb-input__text"
                value={scenarioA}
                onChange={(e) => setScenarioA(e.target.value)}
                placeholder="AI in 5 years — mostly commoditized"
                maxLength={MAX_SCENARIO_CHARS}
                aria-label="Scenario A"
              />
            </label>
            <span className="pfb-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pfb-input__field">
              <span className="pfb-input__label">Scenario B</span>
              <input
                type="text"
                className="pfb-input__text"
                value={scenarioB}
                onChange={(e) => setScenarioB(e.target.value)}
                placeholder="AI in 5 years — mostly concentrated"
                maxLength={MAX_SCENARIO_CHARS}
                aria-label="Scenario B"
              />
            </label>
          </div>
          <div className="pfb-input__meta">
            <span>
              {scenarioA.length + scenarioB.length}/{MAX_SCENARIO_CHARS * 2} chars total
            </span>
            <div className="pfb-input__actions">
              <button
                type="button"
                className="pfb-input__reset"
                onClick={onReset}
                disabled={!scenarioA && !scenarioB}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onBattle}
                disabled={!scenarioA.trim() || !scenarioB.trim()}
                icon={<Crown aria-hidden="true" />}
              >
                Run the battle
              </MotionButton>
            </div>
          </div>
          <div className="pfb-input__stats" aria-label="Forecast battle stats">
            <div className="pfb-input__stat">
              <Crown aria-hidden="true" />
              <span className="pfb-input__stat-label">Battles run</span>
              <span className="pfb-input__stat-value">{castCount}</span>
            </div>
            {lifetimeTally.total > 0 && (
              <div className="pfb-input__stat pfb-input__stat--a">
                <span className="pfb-input__stat-label">A wins</span>
                <span className="pfb-input__stat-value">{lifetimeTally.a}</span>
              </div>
            )}
            {lifetimeTally.total > 0 && (
              <div className="pfb-input__stat pfb-input__stat--b">
                <span className="pfb-input__stat-label">B wins</span>
                <span className="pfb-input__stat-value">{lifetimeTally.b}</span>
              </div>
            )}
            {(castCount > 0 || lifetimeTally.total > 0) && (
              <button
                type="button"
                className="pfb-input__stat-reset"
                onClick={onResetLifetime}
                aria-label="Reset battles counter and lifetime tally"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pfb-samples" aria-label="Sample battles">
          <p className="pfb-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_BATTLES.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pfb-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pfb-sample__label">{sample.label}</span>
                  <span className="pfb-sample__matchup">
                    <span className="pfb-sample__half">"{sample.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pfb-sample__half">"{sample.b}"</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {battle && (
          <section className="pfb-result" aria-label="Battle result">
            <header className="pfb-result__head">
              <p className="pfb-result__kicker">
                <Crown aria-hidden="true" /> The panel has chosen
              </p>
              <h2 className="pfb-result__winner">
                <span
                  className={`pfb-result__winner-pill pfb-result__winner-pill--${battle.winner.toLowerCase()}`}
                >
                  Scenario {battle.winner} wins
                </span>
                <span className="pfb-result__tally">
                  {battle.tally.a} for A · {battle.tally.b} for B
                </span>
              </h2>
            </header>

            <div className="pfb-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pfb-side pfb-side--${side.toLowerCase()}${battle.winner === side ? ' pfb-side--winner' : ''}`}
                >
                  <p className="pfb-side__label">Scenario {side}</p>
                  <blockquote className="pfb-side__quote">
                    {side === 'A' ? battle.scenarioA : battle.scenarioB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pfb-critics">
              {battle.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pfb-critic pfb-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pfb-persona-color' as string]: persona.color,
                      ['--pfb-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pfb-critic__head">
                      <span className="pfb-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pfb-critic__name">{persona.name}</p>
                        <p className="pfb-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pfb-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pfb-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pfb-result__actions">
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
                {copied ? 'Link copied' : 'Share verdict'}
              </MotionButton>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="pfb-history" aria-label="Recent battles">
            <div className="pfb-history__head">
              <p className="pfb-history__label">
                <History aria-hidden="true" /> Recent battles
              </p>
              <button
                type="button"
                className="pfb-history__clear"
                onClick={onClearHistory}
                aria-label="Clear battle history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((entry, idx) => (
                <li key={`${idx}-${entry.a.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pfb-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pfb-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pfb-history__b">B: "{entry.b}"</span>
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