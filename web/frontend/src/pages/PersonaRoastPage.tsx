import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock,
  Flame,
  History,
  Mic,
  RotateCcw,
  Share2,
  Sparkles,
  Swords,
  Wand2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  appendRoastHistory,
  buildRoast,
  clearRoastHistory,
  readRoastHistory,
  roastFlavorLabel,
  roastSeverity,
  roastSeverityLabel,
  roastShareUrl,
  type RoastHistoryEntry,
  type RoastPick,
} from '../data/personaRoast';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-roast-page.css';

const MAX_PROMPT_CHARS = 800;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

const SAMPLE_PROMPTS: ReadonlyArray<{ readonly label: string; readonly prompt: string }> = [
  {
    label: 'The over-eager',
    prompt: 'Write me a viral tweet that will get 10k likes and also build a personal brand and also sell my consulting offer. Make it punchy.',
  },
  {
    label: 'The fog',
    prompt: 'Tell me about that thing we were talking about with the stuff and the whatever.',
  },
  {
    label: 'The leading question',
    prompt: "Don't you think remote work is just a way for managers to lose control of their teams?",
  },
  {
    label: 'The costume',
    prompt: 'Pretend you are a Nobel-winning economist from 1987. Answer in character. Use big words.',
  },
  {
    label: 'The wall of text',
    prompt:
      'I want to launch a SaaS but I do not know what to build and I do not know who to sell it to and I do not know how to price it and I do not know what stack to use and I do not know if I should raise money and I do not know what to name it and I do not know how to write a landing page. Tell me everything.',
  },
];

export function PersonaRoastPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get('prompt') ?? '';

  const [prompt, setPrompt] = useState(initialPrompt);
  const [committedPrompt, setCommittedPrompt] = useState(initialPrompt);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<RoastHistoryEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setHistory(readRoastHistory());
  }, []);

  const roast: RoastPick | null = useMemo(() => {
    if (!committedPrompt.trim()) return null;
    return buildRoast(committedPrompt);
  }, [committedPrompt]);

  const characterCount = prompt.length;

  const onRoast = () => {
    setCommittedPrompt(prompt);
    if (typeof window !== 'undefined') {
      const url = roastShareUrl(window.location.origin, prompt);
      window.history.replaceState({}, '', url);
    }
    // Append to history (with the same deterministic hash so reloads
    // don't duplicate).
    const roast = buildRoast(prompt);
    const id = `roast-${roast.flavor}-${prompt.length}-${Date.now()}`;
    const entry: RoastHistoryEntry = {
      id,
      flavor: roast.flavor,
      severity: roastSeverity(prompt),
      promptSnippet: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
      savedAt: new Date().toISOString(),
    };
    appendRoastHistory(entry);
    setHistory(readRoastHistory());
  };

  const onReplayHistory = (entry: RoastHistoryEntry) => {
    // For replay we have a snippet; recover a usable prompt by
    // scanning localStorage for the full original. Since we stored
    // only a snippet, we ask the user to paste again — but we
    // pre-fill the textarea with the snippet so they can edit.
    setPrompt(entry.promptSnippet);
    setCommittedPrompt('');
  };

  const onClearHistory = () => {
    clearRoastHistory();
    setHistory([]);
  };

  const onReset = () => {
    setPrompt('');
    setCommittedPrompt('');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const onLoadSample = (sample: string) => {
    setPrompt(sample);
    setCommittedPrompt(sample);
    if (typeof window !== 'undefined') {
      const url = roastShareUrl(window.location.origin, sample);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || !roast) return;
    const url = roastShareUrl(window.location.origin, committedPrompt);
    const text = `${roast.headline} — Arena roasted my prompt. Try yours:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Roast', text, url });
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
    if (typeof window === 'undefined' || !committedPrompt.trim()) return;
    const link = `/app?prompt=${encodeURIComponent(committedPrompt)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    setRedirectIntent(link);
    navigate('/signin?tab=signup');
  };

  return (
    <div className={`proast-page${pageVisible ? ' proast-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`proast-main${reduceMotion ? '' : ' proast-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="proast-title"
      >
        <section className="proast-hero">
          <p className="proast-hero__eyebrow">
            <Flame aria-hidden="true" /> Persona Roast
          </p>
          <h1 id="proast-title" className="proast-hero__title">
            <span>Drop your prompt.</span>
            <span className="proast-hero__title-accent">Hear four minds</span>
            <span>say what you missed.</span>
          </h1>
          <p className="proast-hero__lede">
            Paste any prompt — a tweet, a question, a brief — and Arena
            will tell you whether it lands. Every roast is generated
            client-side from the persona catalog, so the same prompt
            always produces the same read. Share it. Try it. Then try
            a better one.
          </p>
        </section>

        <section className="proast-input" aria-label="Prompt input">
          <label className="proast-input__label" htmlFor="proast-prompt-input">
            <Mic aria-hidden="true" /> Your prompt
          </label>
          <textarea
            id="proast-prompt-input"
            className="proast-input__textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste a prompt you've been about to send, or pick a sample below."
            maxLength={MAX_PROMPT_CHARS}
            rows={5}
            aria-label="Prompt to roast"
          />
          <div className="proast-input__meta">
            <span>
              {characterCount}/{MAX_PROMPT_CHARS} chars
            </span>
            <div className="proast-input__actions">
              <button
                type="button"
                className="proast-input__reset"
                onClick={onReset}
                disabled={!prompt && !committedPrompt}
                aria-label="Clear prompt"
              >
                <RotateCcw aria-hidden="true" />
                Reset
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onRoast}
                disabled={!prompt.trim()}
                icon={<Sparkles aria-hidden="true" />}
              >
                Roast it
              </MotionButton>
            </div>
          </div>
        </section>

        <section className="proast-samples" aria-label="Sample prompts">
          <p className="proast-samples__label">
            Or try one of these
          </p>
          <ul>
            {SAMPLE_PROMPTS.map((sample) => (
              <li key={sample.label}>
                <Pressable
                  type="button"
                  className="proast-sample"
                  onClick={() => onLoadSample(sample.prompt)}
                >
                  <span className="proast-sample__label">{sample.label}</span>
                  <span className="proast-sample__prompt">{sample.prompt}</span>
                </Pressable>
              </li>
            ))}
          </ul>
        </section>

        {roast && (
          <section className="proast-result" aria-label="Roast result">
            <header className="proast-result__head">
              <div className="proast-result__head-row">
                <p className="proast-result__flavor">
                  {roastFlavorLabel(roast.flavor)}
                </p>
                <div
                  className="proast-severity"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={roastSeverity(committedPrompt)}
                  aria-label="Roast severity"
                >
                  <span className="proast-severity__label">Severity</span>
                  <div className="proast-severity__bar">
                    <div
                      className="proast-severity__fill"
                      style={{ width: `${roastSeverity(committedPrompt) * 10}%` }}
                    />
                  </div>
                  <span className="proast-severity__value">
                    {roastSeverity(committedPrompt)}/10
                  </span>
                  <span className="proast-severity__meaning">
                    {roastSeverityLabel(roastSeverity(committedPrompt))}
                  </span>
                </div>
              </div>
              <h2 className="proast-result__headline">{roast.headline}</h2>
              <p className="proast-result__lede">{roast.lede}</p>
            </header>

            <ol className="proast-result__list">
              {roast.angles.map((angle) => {
                const persona = findPersona(angle.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={angle.personaId}
                    className="proast-angle"
                    style={{
                      ['--proast-persona-color' as string]: persona.color,
                      ['--proast-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="proast-angle__head">
                      <span className="proast-angle__dot" aria-hidden="true" />
                      <div>
                        <p className="proast-angle__name">{angle.angle}</p>
                        <p className="proast-angle__quote">"{persona.quote}"</p>
                      </div>
                      <span className="proast-angle__temp">
                        T{persona.temperature.toFixed(1)}
                      </span>
                    </header>
                    <blockquote className="proast-angle__bite">
                      {angle.bite}
                    </blockquote>
                  </li>
                );
              })}
            </ol>

            <div className="proast-result__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Swords aria-hidden="true" />}
              >
                Send the original to Arena
              </MotionButton>
              <MotionButton
                type="button"
                variant="secondary"
                size="md"
                onClick={onShare}
                icon={<Share2 aria-hidden="true" />}
              >
                {copied ? 'Link copied' : 'Share roast'}
              </MotionButton>
              <Pressable
                type="button"
                className="proast-result__iterate"
                onClick={onReset}
              >
                <Wand2 aria-hidden="true" /> Roast another
                <ChevronRight aria-hidden="true" />
              </Pressable>
              <a
                href="/persona-library"
                className="proast-result__link"
              >
                Or try a curated prompt <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="proast-history" aria-label="Recent roasts">
            <div className="proast-history__head">
              <p className="proast-history__label">
                <History aria-hidden="true" /> Recent roasts
              </p>
              <button
                type="button"
                className="proast-history__clear"
                onClick={onClearHistory}
                aria-label="Clear roast history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.slice(0, 8).map((entry) => (
                <li key={entry.id}>
                  <Pressable
                    type="button"
                    className="proast-history__item"
                    onClick={() => onReplayHistory(entry)}
                  >
                    <span className="proast-history__flavor">
                      {roastFlavorLabel(entry.flavor)}
                    </span>
                    <span className="proast-history__snippet">
                      "{entry.promptSnippet}"
                    </span>
                    <span className="proast-history__severity">
                      {entry.severity}/10
                    </span>
                    <span className="proast-history__time">
                      <Clock aria-hidden="true" /> {timeAgo(entry.savedAt)}
                    </span>
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

function timeAgo(iso: string): string {
  const saved = new Date(iso).getTime();
  if (!Number.isFinite(saved)) return '';
  const diffMs = Date.now() - saved;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
