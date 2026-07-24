import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  RotateCcw,
  Share2,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  buildMosaicCouncil,
  MOSAIC_PANEL_PRESETS,
  mosaicCouncilShareUrl,
  mosaicCouncilValid,
  readMosaicCouncilCounter,
  incrementMosaicCouncilCounter,
  clearMosaicCouncilCounter,
  type MosaicCouncilTake,
  type MosaicStance,
  type PersonaMosaicCouncil,
} from '../data/personaMosaicCouncil';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-mosaic-council-page.css';

const MAX_QUESTION_CHARS = 400;
const DEFAULT_PANEL = ['analyst', 'philosopher', 'pragmatist', 'contrarian'];

const STANCE_LABELS: Record<MosaicStance, string> = {
  agrees: 'agrees',
  cautions: 'cautions',
  reframes: 'reframes',
  pushes: 'pushes',
};

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_QUESTIONS: ReadonlyArray<{ readonly label: string; readonly question: string; readonly panel?: ReadonlyArray<string> }> = [
  {
    label: 'The team decision',
    question: 'Should we ship this feature on Friday or wait until Monday?',
    panel: ['pragmatist', 'strategist', 'engineer', 'contrarian'],
  },
  {
    label: 'The career question',
    question: 'Should I take the safe job or the risky startup?',
    panel: ['pragmatist', 'stoic', 'optimist', 'contrarian'],
  },
  {
    label: 'The strategy call',
    question: 'Should we ship fast and learn, or wait and ship right?',
    panel: ['pragmatist', 'engineer', 'strategist', 'ethicist'],
  },
];

export function PersonaMosaicCouncilPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const sharedQ = searchParams.get('q') ?? '';
  const sharedPanel = (searchParams.get('p') ?? '').split(',').filter(Boolean);

  const [question, setQuestion] = useState(sharedQ);
  const [panel, setPanel] = useState<ReadonlyArray<string>>(
    sharedPanel.length > 0 ? sharedPanel : DEFAULT_PANEL,
  );
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [convenedCount, setConvenedCount] = useState(0);

  useEffect(() => {
    setPageVisible(true);
    setConvenedCount(readMosaicCouncilCounter());
  }, []);

  const council: PersonaMosaicCouncil | null = useMemo(() => {
    if (!question.trim() || panel.length !== 4) return null;
    const c = buildMosaicCouncil(question, panel);
    return mosaicCouncilValid(c) ? c : null;
  }, [question, panel]);

  const onTogglePersona = (id: string) => {
    setPanel((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const onConvene = () => {
    if (typeof window === 'undefined') return;
    const url = mosaicCouncilShareUrl(window.location.origin, question, panel);
    window.history.replaceState({}, '', url);
    const c = incrementMosaicCouncilCounter();
    setConvenedCount(c);
  };

  const onLoadPreset = (presetPanel: ReadonlyArray<string>) => {
    setPanel(presetPanel);
  };

  const onResetCounter = () => {
    clearMosaicCouncilCounter();
    setConvenedCount(0);
  };

  const onReset = () => {
    setQuestion('');
    setPanel(DEFAULT_PANEL);
    if (typeof window !== 'undefined') {
      const url = mosaicCouncilShareUrl(window.location.origin, '', DEFAULT_PANEL);
      window.history.replaceState({}, '', url);
    }
  };

  const onLoadSample = (sample: { question: string; panel?: ReadonlyArray<string> }) => {
    setQuestion(sample.question);
    if (sample.panel) setPanel(sample.panel);
    if (typeof window !== 'undefined') {
      const url = mosaicCouncilShareUrl(
        window.location.origin,
        sample.question,
        sample.panel ?? panel,
      );
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !council) return;
    const url = mosaicCouncilShareUrl(window.location.origin, question, panel);
    const panelNames = council.panel
      .map((id) => PERSONAS.find((p) => p.id === id)?.name ?? id)
      .join(', ');
    const text = `My Arena Mosaic Council (${panelNames}) deliberated on: "${question}". Run yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic Council', text, url });
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
    if (typeof window === 'undefined' || !question.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(`Mosaic Council on: ${question}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const panelFull = panel.length === 4;

  return (
    <div className={`pmc-page${pageVisible ? ' pmc-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmc-main${reduceMotion ? '' : ' pmc-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmc-title"
      >
        <section className="pmc-hero">
          <p className="pmc-hero__eyebrow">
            <Users aria-hidden="true" /> Persona Mosaic Council
          </p>
          <h1 id="pmc-title" className="pmc-hero__title">
            <span>Pick four minds.</span>
            <span className="pmc-hero__title-accent">Ask anything.</span>
            <span>Build your own council.</span>
          </h1>
          <p className="pmc-hero__lede">
            The full Mosaic is sixteen minds. The Mosaic Council lets
            you pick exactly four. Same panel + same question = same
            verdict, so a shared link replays the exact same
            deliberation.
          </p>
        </section>

        <section className="pmc-input" aria-label="Council input">
          <label className="pmc-input__label" htmlFor="pmc-question-input">
            <Wand2 aria-hidden="true" /> The question
          </label>
          <textarea
            id="pmc-question-input"
            className="pmc-input__textarea"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Should I take the safe job or the risky startup?"
            maxLength={MAX_QUESTION_CHARS}
            rows={3}
            aria-label="Council question"
          />
          <div className="pmc-input__meta">
            <span>
              {question.length}/{MAX_QUESTION_CHARS} chars
            </span>
            <div className="pmc-input__actions">
              <button
                type="button"
                className="pmc-input__reset"
                onClick={onReset}
                disabled={!question && panel === DEFAULT_PANEL}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onConvene}
                disabled={!question.trim() || !panelFull}
                icon={<Sparkles aria-hidden="true" />}
              >
                Convene council
              </MotionButton>
            </div>
          </div>
        </section>

        <section className="pmc-panel" aria-label="Pick your panel">
          <div className="pmc-panel__head">
            <p className="pmc-panel__label">
              <Filter aria-hidden="true" /> Pick your 4 minds ({panel.length} / 4)
            </p>
            <div className="pmc-panel__stats">
              <Sparkles aria-hidden="true" />
              <span>Councils convened: <strong>{convenedCount}</strong></span>
              {convenedCount > 0 && (
                <button
                  type="button"
                  className="pmc-panel__reset"
                  onClick={onResetCounter}
                  aria-label="Reset councils counter"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          <div className="pmc-presets" aria-label="Panel presets">
            <p className="pmc-presets__label">Quick-load a preset panel</p>
            <ul>
              {MOSAIC_PANEL_PRESETS.map((preset) => {
                const isCurrent = preset.panel.join('|') === panel.join('|');
                return (
                  <li key={preset.id}>
                    <Pressable
                      type="button"
                      className={`pmc-preset${isCurrent ? ' pmc-preset--active' : ''}`}
                      onClick={() => onLoadPreset(preset.panel)}
                    >
                      <span className="pmc-preset__label">{preset.label}</span>
                      <span className="pmc-preset__description">{preset.description}</span>
                    </Pressable>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="pmc-panel__list">
            {PERSONAS.map((persona) => {
              const isSelected = panel.includes(persona.id);
              const disabled = !isSelected && panel.length >= 4;
              return (
                <li key={persona.id}>
                  <Pressable
                    type="button"
                    className={`pmc-persona${isSelected ? ' pmc-persona--selected' : ''}`}
                    onClick={() => onTogglePersona(persona.id)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    style={{
                      ['--pmc-persona-color' as string]: persona.color,
                      ['--pmc-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <span className="pmc-persona__dot" aria-hidden="true" />
                    <span className="pmc-persona__name">{persona.name}</span>
                    <span className="pmc-persona__check">
                      {isSelected && <CheckCircle2 aria-hidden="true" />}
                    </span>
                  </Pressable>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="pmc-samples" aria-label="Sample questions">
          <p className="pmc-samples__label">Or try one of these</p>
          <ul>
            {SAMPLE_QUESTIONS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="pmc-sample"
                  onClick={() => onLoadSample(sample)}
                >
                  <span className="pmc-sample__label">{sample.label}</span>
                  <span className="pmc-sample__question">
                    "{sample.question}"
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {council && (
          <section className="pmc-result" aria-label="Council verdict">
            <header className="pmc-result__head">
              <p className="pmc-result__kicker">
                <Users aria-hidden="true" /> The council has spoken
              </p>
              <h2 className="pmc-result__question">"{council.question}"</h2>
              <p className="pmc-result__panel">
                Panel of {council.panel.length}:{' '}
                {council.panel
                  .map((id) => PERSONAS.find((p) => p.id === id)?.name ?? id)
                  .join(' · ')}
              </p>
            </header>

            <ol className="pmc-result__list">
              {council.takes.map((take) => {
                const persona = findPersona(take.personaId);
                if (!persona) return null;
                return <CouncilCard key={take.personaId} take={take} personaName={persona.name} personaColor={persona.color} personaBg={persona.bgTint} personaQuote={persona.quote} />;
              })}
            </ol>

            <div className="pmc-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<ChevronRight aria-hidden="true" />}
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
                {copied ? 'Link copied' : 'Share council'}
              </MotionButton>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

interface CouncilCardProps {
  readonly take: MosaicCouncilTake;
  readonly personaName: string;
  readonly personaColor: string;
  readonly personaBg: string;
  readonly personaQuote: string;
}

function CouncilCard({ take, personaName, personaColor, personaBg, personaQuote }: CouncilCardProps) {
  return (
    <li
      className={`pmc-card pmc-card--${take.stance}`}
      style={{
        ['--pmc-card-color' as string]: personaColor,
        ['--pmc-card-bg' as string]: personaBg,
      }}
    >
      <header className="pmc-card__head">
        <span className="pmc-card__dot" aria-hidden="true" />
        <div>
          <p className="pmc-card__name">{personaName}</p>
          <p className="pmc-card__quote">"{personaQuote}"</p>
        </div>
        <span className={`pmc-card__stance pmc-card__stance--${take.stance}`}>
          {STANCE_LABELS[take.stance]}
        </span>
      </header>
      <p className="pmc-card__take">{take.take}</p>
    </li>
  );
}