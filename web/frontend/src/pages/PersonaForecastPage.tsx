import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock,
  History,
  RotateCcw,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wand2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  FORECAST_STANCE_LABELS,
  buildForecast,
  clearForecastCounter,
  forecastShareUrl,
  forecastValid,
  incrementForecastCounter,
  readForecastCounter,
  type ForecastStance,
  type PersonaForecast,
} from '../data/personaForecast';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-forecast-page.css';

const MAX_SCENARIO_CHARS = 200;

const STANCE_ICONS: Record<ForecastStance, typeof TrendingUp> = {
  'predicts-up': TrendingUp,
  'predicts-down': TrendingDown,
  'predicts-sideways': ArrowRight,
  'predicts-disruption': Sparkles,
};

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_SCENARIOS: ReadonlyArray<{ readonly label: string; readonly scenario: string }> = [
  {
    label: 'AI in 10 years',
    scenario: 'AI in 10 years',
  },
  {
    label: 'Remote work in 5 years',
    scenario: 'Remote work in 5 years',
  },
  {
    label: 'Climate by 2040',
    scenario: 'Climate by 2040',
  },
  {
    label: 'Crypto in 5 years',
    scenario: 'Crypto in 5 years',
  },
];

export function PersonaForecastPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialScenario = searchParams.get('s') ?? '';

  const [scenario, setScenario] = useState(initialScenario);
  const [committed, setCommitted] = useState(initialScenario);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [castCount, setCastCount] = useState(0);
  const [stanceFilter, setStanceFilter] = useState<ForecastStance | null>(null);

  useEffect(() => {
    setPageVisible(true);
    setCastCount(readForecastCounter());
    try {
      const raw = window.localStorage.getItem('arena:persona-forecast:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const forecast: PersonaForecast | null = useMemo(() => {
    if (!committed.trim()) return null;
    const f = buildForecast(committed);
    return forecastValid(f) ? f : null;
  }, [committed]);

  const filteredTakes = useMemo(() => {
    if (!forecast) return [];
    if (!stanceFilter) return forecast.takes;
    return forecast.takes.filter((t) => t.stance === stanceFilter);
  }, [forecast, stanceFilter]);

  const onForecast = () => {
    setCommitted(scenario);
    if (typeof window !== 'undefined') {
      const url = forecastShareUrl(window.location.origin, scenario);
      window.history.replaceState({}, '', url);
    }
    try {
      const next = [scenario, ...history.filter((s) => s !== scenario)].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-forecast:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
    const c = incrementForecastCounter();
    setCastCount(c);
  };

  const onResetCounter = () => {
    clearForecastCounter();
    setCastCount(0);
  };

  const onReset = () => {
    setScenario('');
    setCommitted('');
    if (typeof window !== 'undefined') {
      const url = forecastShareUrl(window.location.origin, '');
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: string) => {
    setScenario(sample);
    setCommitted(sample);
    if (typeof window !== 'undefined') {
      const url = forecastShareUrl(window.location.origin, sample);
      window.history.replaceState({}, '', url);
    }
  };

  const onReplayHistory = (s: string) => {
    setScenario(s);
    setCommitted(s);
    if (typeof window !== 'undefined') {
      const url = forecastShareUrl(window.location.origin, s);
      window.history.replaceState({}, '', url);
    }
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-forecast:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !forecast) return;
    const url = forecastShareUrl(window.location.origin, committed);
    const text = `Arena Forecast: "${committed}" — 4 Arena minds disagree. Read the predictions:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Forecast', text, url });
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
    const link = `/app?prompt=${encodeURIComponent(`Forecast: ${committed}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  return (
    <div className={`pf-page${pageVisible ? ' pf-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pf-main${reduceMotion ? '' : ' pf-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pf-title"
      >
        <section className="pf-hero">
          <p className="pf-hero__eyebrow">
            <Wand2 aria-hidden="true" /> Persona Forecast
          </p>
          <h1 id="pf-title" className="pf-hero__title">
            <span>Name a future.</span>
            <span className="pf-hero__title-accent">Four minds weigh in.</span>
          </h1>
          <p className="pf-hero__lede">
            Type any scenario — "AI in 10 years", "remote work in 5
            years", "crypto by 2030". Four Arena minds forecast it from
            their angle: up, down, sideways, or disruption. Same
            scenario always produces the same forecast.
          </p>
        </section>

        <section className="pf-input" aria-label="Scenario input">
          <label className="pf-input__label" htmlFor="pf-scenario-input">
            <Sparkles aria-hidden="true" /> Your scenario
          </label>
          <input
            id="pf-scenario-input"
            className="pf-input__text"
            type="text"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="AI in 10 years"
            maxLength={MAX_SCENARIO_CHARS}
            aria-label="Future scenario"
          />
          <div className="pf-input__meta">
            <span>
              {scenario.length}/{MAX_SCENARIO_CHARS} chars
            </span>
            <div className="pf-input__actions">
              <button
                type="button"
                className="pf-input__reset"
                onClick={onReset}
                disabled={!scenario && !committed}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onForecast}
                disabled={!scenario.trim()}
                icon={<Sparkles aria-hidden="true" />}
              >
                Forecast it
              </MotionButton>
            </div>
          </div>
          <div className="pf-input__stats" aria-label="Forecast stats">
            <div className="pf-input__stat">
              <Sparkles aria-hidden="true" />
              <span className="pf-input__stat-label">Forecasts cast</span>
              <span className="pf-input__stat-value">{castCount}</span>
            </div>
            {castCount > 0 && (
              <button
                type="button"
                className="pf-input__stat-reset"
                onClick={onResetCounter}
                aria-label="Reset forecasts counter"
              >
                Reset
              </button>
            )}
          </div>
        </section>

        <section className="pf-samples" aria-label="Sample scenarios">
          <p className="pf-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_SCENARIOS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pf-sample"
                  onClick={() => onLoadSample(sample.scenario)}
                >
                  <span className="pf-sample__label">{sample.label}</span>
                  <span className="pf-sample__scenario">"{sample.scenario}"</span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {forecast && (
          <section className="pf-result" aria-label="Forecast result">
            <header className="pf-result__head">
              <p className="pf-result__kicker">
                <Sparkles aria-hidden="true" /> Four minds, four predictions
              </p>
              <h2 className="pf-result__scenario">"{forecast.scenario}"</h2>
              <div className="pf-result__summary">
                {(['up', 'down', 'sideways', 'disruption'] as const).map((key) => (
                  <span
                    key={key}
                    className={`pf-result__chip pf-result__chip--${key}`}
                  >
                    {forecast.summary[key]} {key}
                  </span>
                ))}
              </div>
            </header>

            <div
              className="pf-filter"
              role="radiogroup"
              aria-label="Filter by stance"
            >
              <Pressable
                type="button"
                role="radio"
                aria-checked={stanceFilter === null}
                className={`pf-filter__chip${stanceFilter === null ? ' pf-filter__chip--active' : ''}`}
                onClick={() => setStanceFilter(null)}
              >
                All ({forecast.takes.length})
              </Pressable>
              {(['predicts-up', 'predicts-down', 'predicts-sideways', 'predicts-disruption'] as const).map(
                (stance) => {
                  const count = forecast.takes.filter((t) => t.stance === stance).length;
                  if (count === 0) return null;
                  return (
                    <Pressable
                      key={stance}
                      type="button"
                      role="radio"
                      aria-checked={stanceFilter === stance}
                      className={`pf-filter__chip pf-filter__chip--${stance}${stanceFilter === stance ? ' pf-filter__chip--active' : ''}`}
                      onClick={() => setStanceFilter(stance)}
                    >
                      {FORECAST_STANCE_LABELS[stance]} ({count})
                    </Pressable>
                  );
                },
              )}
            </div>

            <ul className="pf-list">
              {filteredTakes.map((take) => {
                const persona = findPersona(take.personaId);
                if (!persona) return null;
                const StanceIcon = STANCE_ICONS[take.stance];
                return (
                  <li
                    key={take.personaId}
                    className="pf-card"
                    data-stance={take.stance}
                    style={{
                      ['--pf-persona-color' as string]: persona.color,
                      ['--pf-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pf-card__head">
                      <span className="pf-card__dot" aria-hidden="true" />
                      <div>
                        <p className="pf-card__name">{persona.name}</p>
                        <p className="pf-card__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pf-card__stance">
                        <StanceIcon aria-hidden="true" />
                        {FORECAST_STANCE_LABELS[take.stance]}
                      </span>
                    </header>
                    <p className="pf-card__prediction">{take.prediction}</p>
                    <p className="pf-card__followup">
                      <ChevronRight aria-hidden="true" /> {take.followup}
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="pf-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Send the scenario to Arena
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
          <section className="pf-history" aria-label="Recent scenarios">
            <div className="pf-history__head">
              <p className="pf-history__label">
                <History aria-hidden="true" /> Recent scenarios
              </p>
              <button
                type="button"
                className="pf-history__clear"
                onClick={onClearHistory}
                aria-label="Clear scenario history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.map((s, idx) => (
                <li key={`${idx}-${s.slice(0, 16)}`}>
                  <Pressable
                    type="button"
                    className="pf-history__item"
                    onClick={() => onReplayHistory(s)}
                  >
                    <span className="pf-history__scenario">"{s}"</span>
                    <Clock aria-hidden="true" />
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