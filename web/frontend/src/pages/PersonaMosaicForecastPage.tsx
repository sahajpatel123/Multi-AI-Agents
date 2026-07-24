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
  buildMosaicForecast,
  mosaicForecastShareUrl,
  mosaicForecastValid,
  type PersonaMosaicForecast,
} from '../data/personaMosaicForecast';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-forecast-page.css';

const MAX_OUTPUT_CHARS = 1000;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_FORECASTS: ReadonlyArray<{ readonly label: string; readonly a: string; readonly b: string }> = [
  {
    label: 'AI in 5 years',
    a: 'AI in 5 years will be mostly commoditized infrastructure — every company will have AI as a utility, the differentiation will be in the data and the workflow.',
    b: 'AI in 5 years will be concentrated in a few frontier labs — the compute and the talent will gatekeep the value and most users will rent access.',
  },
  {
    label: 'Remote work in 3 years',
    a: 'Remote work in 3 years will be the default for knowledge work — distributed teams outperform co-located on every meaningful axis.',
    b: 'Remote work in 3 years will revert to a hybrid center — companies will discover the cost of pure distribution and pull teams back to physical hubs.',
  },
  {
    label: 'Climate in 20 years',
    a: 'Climate in 20 years will be substantially managed through geoengineering and adaptation — humans will adapt to a warmer planet through technology.',
    b: 'Climate in 20 years will be increasingly catastrophic — the cost of late action will compound faster than the pace of adaptation.',
  },
  {
    label: 'Crypto in 5 years',
    a: 'Crypto in 5 years will be a mainstream currency — the technology has matured, the regulation has caught up, and the network effect is now unstoppable.',
    b: 'Crypto in 5 years will be a niche asset class — the technology is interesting but the regulatory and energy cost will keep it from the mainstream.',
  },
];

export function PersonaMosaicForecastPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';

  const [outputA, setOutputA] = useState(initialA);
  const [outputB, setOutputB] = useState(initialB);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<{ a: string; b: string }>>([]);

  useEffect(() => {
    setPageVisible(true);
    try {
      const raw = window.localStorage.getItem('arena:persona-mosaic-forecast:history:v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch {
      /* silent */
    }
  }, []);

  const forecast: PersonaMosaicForecast | null = useMemo(() => {
    if (!outputA.trim() || !outputB.trim()) return null;
    const f = buildMosaicForecast(outputA, outputB);
    return mosaicForecastValid(f) ? f : null;
  }, [outputA, outputB]);

  const onForecast = () => {
    const url = mosaicForecastShareUrl(
      window.location.origin,
      outputA,
      outputB,
    );
    window.history.replaceState({}, '', url);
    try {
      const snippetA = outputA.length > 40 ? `${outputA.slice(0, 37)}...` : outputA;
      const snippetB = outputB.length > 40 ? `${outputB.slice(0, 37)}...` : outputB;
      const entry = { a: snippetA, b: snippetB };
      const next = [
        entry,
        ...history.filter((h) => h.a !== snippetA || h.b !== snippetB),
      ].slice(0, 6);
      window.localStorage.setItem(
        'arena:persona-mosaic-forecast:history:v1',
        JSON.stringify(next),
      );
      setHistory(next);
    } catch {
      /* silent */
    }
  };

  const onReset = () => {
    setOutputA('');
    setOutputB('');
    const url = mosaicForecastShareUrl(window.location.origin, '', '');
    window.history.replaceState({}, '', url);
  };

  const onLoadSample = (sample: { a: string; b: string }) => {
    setOutputA(sample.a);
    setOutputB(sample.b);
    const url = mosaicForecastShareUrl(
      window.location.origin,
      sample.a,
      sample.b,
    );
    window.history.replaceState({}, '', url);
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !forecast) return;
    const url = mosaicForecastShareUrl(
      window.location.origin,
      outputA,
      outputB,
    );
    const winnerLabel = forecast.winner === 'A' ? 'Forecast A' : 'Forecast B';
    const winnerCount = forecast.winner === 'A' ? forecast.tally.a : forecast.tally.b;
    const text = `Arena Mosaic Forecast: 4 Arena minds picked ${winnerLabel} (${winnerCount} of 4). Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Forecast', text, url });
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
    if (typeof window === 'undefined' || !outputA.trim() || !outputB.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Mosaic Forecast on: A) ${outputA} B) ${outputB}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onReplayHistory = (entry: { a: string; b: string }) => {
    setOutputA(entry.a);
    setOutputB(entry.b);
  };

  const onClearHistory = () => {
    try {
      window.localStorage.removeItem('arena:persona-mosaic-forecast:history:v1');
    } catch {
      /* silent */
    }
    setHistory([]);
  };

  return (
    <div className={`pmf-page${pageVisible ? ' pmf-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmf-main${reduceMotion ? '' : ' pmf-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmf-title"
      >
        <section className="pmf-hero">
          <p className="pmf-hero__eyebrow">
            <Sparkles aria-hidden="true" /> Persona Mosaic Forecast
          </p>
          <h1 id="pmf-title" className="pmf-hero__title">
            <span>Two futures.</span>
            <span className="pmf-hero__title-accent">Four minds pick.</span>
            <span>One is sharper.</span>
          </h1>
          <p className="pmf-hero__lede">
            Paste two future-scenario forecasts and a 4-persona
            panel picks the sharper one. Each mind votes +
            explains. Same forecasts in = same verdict, so a
            shared link replays the exact same Mosaic.
          </p>
        </section>

        <section className="pmf-input" aria-label="Forecast input">
          <div className="pmf-input__row">
            <label className="pmf-input__field">
              <span className="pmf-input__label">Forecast A</span>
              <textarea
                className="pmf-input__textarea"
                value={outputA}
                onChange={(e) => setOutputA(e.target.value)}
                placeholder="Paste the first forecast..."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Forecast A"
              />
            </label>
            <span className="pmf-input__vs" aria-hidden="true">
              vs
            </span>
            <label className="pmf-input__field">
              <span className="pmf-input__label">Forecast B</span>
              <textarea
                className="pmf-input__textarea"
                value={outputB}
                onChange={(e) => setOutputB(e.target.value)}
                placeholder="Paste the second forecast..."
                maxLength={MAX_OUTPUT_CHARS}
                rows={4}
                aria-label="Forecast B"
              />
            </label>
          </div>
          <div className="pmf-input__meta">
            <span>
              {outputA.length + outputB.length}/{MAX_OUTPUT_CHARS * 2} chars total
            </span>
            <div className="pmf-input__actions">
              <button
                type="button"
                className="pmf-input__reset"
                onClick={onReset}
                disabled={!outputA && !outputB}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onForecast}
                disabled={!outputA.trim() || !outputB.trim()}
                icon={<Sparkles aria-hidden="true" />}
              >
                Compare forecasts
              </MotionButton>
            </div>
          </div>
        </section>

        <section className="pmf-samples" aria-label="Sample forecasts">
          <p className="pmf-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_FORECASTS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmf-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmf-sample__label">{sample.label}</span>
                  <span className="pmf-sample__matchup">
                    <span className="pmf-sample__half">"{sample.a.slice(0, 50)}..."</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmf-sample__half">"{sample.b.slice(0, 50)}..."</span>
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {forecast && (
          <section className="pmf-result" aria-label="Mosaic forecast result">
            <header className="pmf-result__head">
              <p className="pmf-result__kicker">
                <Sparkles aria-hidden="true" /> The 4-mind panel has chosen
              </p>
              <h2 className="pmf-result__winner">
                <span
                  className={`pmf-result__winner-pill pmf-result__winner-pill--${forecast.winner.toLowerCase()}`}
                >
                  Forecast {forecast.winner} is sharper
                </span>
                <span className="pmf-result__tally">
                  {forecast.tally.a} for A · {forecast.tally.b} for B
                </span>
              </h2>
            </header>

            <div className="pmf-sides">
              {(['A', 'B'] as const).map((side) => (
                <div
                  key={side}
                  className={`pmf-side pmf-side--${side.toLowerCase()}${forecast.winner === side ? ' pmf-side--winner' : ''}`}
                >
                  <p className="pmf-side__label">Forecast {side}</p>
                  <blockquote className="pmf-side__quote">
                    {side === 'A' ? forecast.outputA : forecast.outputB}
                  </blockquote>
                </div>
              ))}
            </div>

            <ol className="pmf-critics">
              {forecast.critiques.map((critique) => {
                const persona = findPersona(critique.personaId);
                if (!persona) return null;
                const isUp = critique.pick === 'A';
                return (
                  <li
                    key={critique.personaId}
                    className={`pmf-critic pmf-critic--${critique.pick.toLowerCase()}`}
                    style={{
                      ['--pmf-persona-color' as string]: persona.color,
                      ['--pmf-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pmf-critic__head">
                      <span className="pmf-critic__dot" aria-hidden="true" />
                      <div>
                        <p className="pmf-critic__name">{persona.name}</p>
                        <p className="pmf-critic__quote">"{persona.quote}"</p>
                      </div>
                      <span className="pmf-critic__pick">
                        {isUp ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                        Picks {critique.pick}
                      </span>
                    </header>
                    <p className="pmf-critic__take">{critique.take}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pmf-result__actions">
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
          <section className="pmf-history" aria-label="Recent forecasts">
            <div className="pmf-history__head">
              <p className="pmf-history__label">
                <History aria-hidden="true" /> Recent forecasts
              </p>
              <button
                type="button"
                className="pmf-history__clear"
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
                    className="pmf-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="pmf-history__a">A: "{entry.a}"</span>
                    <ArrowRight aria-hidden="true" />
                    <span className="pmf-history__b">B: "{entry.b}"</span>
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