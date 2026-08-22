import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  History,
  RefreshCw,
  Share2,
  Sparkles,
  Swords,
  Users,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import { PERSONAS } from '../data/personas';
import {
  appendSpinHistory,
  clearSpinHistory,
  discoveredPersonas,
  playLanding,
  playTick,
  readSpinHistory,
  spinPersonas,
  wheelArenaLink,
  wheelBattleLink,
  wheelMatchLink,
  wheelShareUrl,
  type WheelMode,
  type WheelSpinEntry,
} from '../data/personaWheel';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-wheel-page.css';

interface WheelModeOption {
  readonly id: WheelMode;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly Icon: typeof User;
}

const WHEEL_MODES: ReadonlyArray<WheelModeOption> = [
  {
    id: 'single',
    label: 'Spin a Mind',
    description: 'Discover one persona. Find your match.',
    count: 1,
    Icon: User,
  },
  {
    id: 'pair',
    label: 'Spin a Battle',
    description: 'Two minds. One stage. Take it to /persona-battle.',
    count: 2,
    Icon: Swords,
  },
  {
    id: 'trio',
    label: 'Spin a Trio',
    description: 'Three minds. A ready-to-run panel for Arena.',
    count: 3,
    Icon: Users,
  },
];

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

function pickInitialMode(raw: string | null): WheelMode {
  if (raw === 'pair' || raw === 'trio') return raw;
  return 'single';
}

function generateSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parsePersonaIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => PERSONAS.some((p) => p.id === s));
}

export function PersonaWheelPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();

  const initialMode = pickInitialMode(searchParams.get('mode'));
  const seedParam = searchParams.get('seed');
  const initialPicked = parsePersonaIds(searchParams.get('p'));
  const sharedSeed = seedParam && initialPicked.length > 0 ? seedParam : null;

  const [mode, setMode] = useState<WheelMode>(initialMode);
  const [picked, setPicked] = useState<ReadonlyArray<string>>(
    initialPicked.length > 0 ? initialPicked : [],
  );
  const [seed, setSeed] = useState<string>(sharedSeed ?? generateSeed());
  const [spinning, setSpinning] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ReadonlyArray<WheelSpinEntry>>([]);
  const [audioOn, setAudioOn] = useState(true);

  // Load spin history on mount.
  useEffect(() => {
    setHistory(readSpinHistory());
  }, []);

  const discovered = useMemo(() => discoveredPersonas(history), [history]);
  const discoveredCount = discovered.length;
  const totalPersonas = PERSONAS.length;

  useEffect(() => {
    setPageVisible(true);
  }, []);

  const count = useMemo(
    () => WHEEL_MODES.find((m) => m.id === mode)?.count ?? 1,
    [mode],
  );

  const onSpin = useCallback(() => {
    setSpinning(true);
    // Schedule a few audio ticks during the spin to give the wheel a
    // mechanical feel without overlapping the landing chord.
    if (audioOn) {
      for (let i = 0; i < 6; i++) {
        window.setTimeout(() => playTick(0.4 + i * 0.04), 80 + i * 130);
      }
    }
    const newSeed = generateSeed();
    window.setTimeout(() => {
      const result = spinPersonas(count);
      setSeed(newSeed);
      setPicked(result);
      setSpinning(false);
      if (audioOn) playLanding();
      if (typeof window !== 'undefined') {
        const url = wheelShareUrl(window.location.origin, mode, result, newSeed);
        window.history.replaceState({}, '', url);
      }
      // Append to spin history (capped at 24 entries inside the helper).
      const entry: WheelSpinEntry = {
        id: `${mode}-${newSeed}`,
        mode,
        personaIds: result,
        seed: newSeed,
        savedAt: new Date().toISOString(),
      };
      appendSpinHistory(entry);
      setHistory(readSpinHistory());
    }, 1100);
  }, [audioOn, count, mode]);

  // When the mode changes, clear the result so the user doesn't see a stale
  // single-persona result after switching to "trio".
  const onModeChange = (next: WheelMode) => {
    if (next === mode) return;
    setMode(next);
    setPicked([]);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      url.searchParams.set('mode', next);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined' || picked.length === 0) return;
    const url = wheelShareUrl(window.location.origin, mode, picked, seed);
    const names = picked.map((id) => findPersona(id)?.name ?? id).join(' vs ');
    const text =
      picked.length === 1
        ? `Arena wheel landed on ${names}.`
        : `Arena wheel spun up ${names}.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Wheel', text, url });
        return;
      } catch (err) {
        /* fall through to clipboard */
      }
    }
    const ok = await copyToClipboard(`${text} ${url}`);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const onTryInArena = () => {
    if (picked.length === 0) return;
    const link = wheelArenaLink(picked);
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    setRedirectIntent(link);
    navigate('/signin?tab=signup');
  };

  const onReplayHistory = (entry: WheelSpinEntry) => {
    setMode(entry.mode);
    setPicked(entry.personaIds);
    setSeed(entry.seed);
    if (typeof window !== 'undefined') {
      const url = wheelShareUrl(
        window.location.origin,
        entry.mode,
        entry.personaIds,
        entry.seed,
      );
      window.history.replaceState({}, '', url);
    }
  };

  const onClearHistory = () => {
    clearSpinHistory();
    setHistory([]);
  };

  // If the URL has a deterministic seed + persona list on first render,
  // trust it (this is a shared link). Otherwise generate a fresh spin on
  // mount so users see something happen immediately.
  useEffect(() => {
    if (sharedSeed) return;
    if (picked.length === 0) {
      onSpin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the wheel as a 12-slot ring; the picked persona's color fills
  // the slot that lands at the pointer.
  const wheelSegments = useMemo(() => {
    const ids = PERSONAS.map((p) => p.id);
    return ids.map((id, index) => {
      const persona = findPersona(id)!;
      const angle = (360 / ids.length) * index;
      return { id, persona, angle };
    });
  }, []);

  return (
    <div className={`pw-page${pageVisible ? ' pw-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pw-main${reduceMotion ? '' : ' pw-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pw-title"
      >
        <section className="pw-hero">
          <p className="pw-hero__eyebrow">Persona Wheel</p>
          <h1 id="pw-title" className="pw-hero__title">
            <span>Spin the arena.</span>
            <span className="pw-hero__title-accent">Meet a new mind.</span>
          </h1>
          <p className="pw-hero__lede">
            Roll the wheel. Land on one of the sixteen Arena minds, or pick two
            and let them collide. Every spin is shareable — your friends land on
            the exact same combo.
          </p>
        </section>

        <section className="pw-controls" aria-label="Wheel controls">
          <div className="pw-mode-toggle" role="radiogroup" aria-label="Wheel mode">
            {WHEEL_MODES.map(({ id, label, description, Icon }) => {
              const active = id === mode;
              return (
                <Pressable
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`pw-mode${active ? ' pw-mode--active' : ''}`}
                  onClick={() => onModeChange(id)}
                  disabled={spinning}
                >
                  <Icon aria-hidden="true" className="pw-mode__icon" />
                  <span className="pw-mode__label">{label}</span>
                  <span className="pw-mode__description">{description}</span>
                </Pressable>
              );
            })}
          </div>
        </section>

        <section className="pw-stage" aria-label="Spin result">
          <div className="pw-stage__ring">
            <div
              className={`pw-wheel${spinning ? ' pw-wheel--spinning' : ''}${
                picked.length > 0 ? ' pw-wheel--settled' : ''
              }`}
              aria-hidden="true"
            >
              {wheelSegments.map(({ id, persona, angle }) => {
                const isHit = picked.includes(id);
                return (
                  <span
                    key={id}
                    className={`pw-wheel__seg${isHit ? ' pw-wheel__seg--hit' : ''}`}
                    style={{
                      transform: `rotate(${angle}deg)`,
                      background: persona.color,
                    }}
                  />
                );
              })}
              <div className="pw-wheel__hub" aria-hidden="true">
                <Sparkles aria-hidden="true" />
              </div>
            </div>
            <div className="pw-stage__pointer" aria-hidden="true" />
          </div>

          <div className="pw-result" aria-live="polite">
            {picked.length === 0 ? (
              <p className="pw-result__empty">Spin to discover.</p>
            ) : (
              <>
                <p className="pw-result__kicker">
                  The wheel landed on
                </p>
                <div className="pw-result__cards">
                  {picked.map((id, index) => {
                    const persona = findPersona(id);
                    if (!persona) return null;
                    return (
                      <article
                        key={id}
                        className="pw-result__card"
                        style={{
                          ['--pw-persona-color' as string]: persona.color,
                          ['--pw-persona-bg' as string]: persona.bgTint,
                        }}
                      >
                        <span className="pw-result__rank">
                          {picked.length > 1 ? `#${index + 1}` : '★'}
                        </span>
                        <h2 className="pw-result__name">{persona.name}</h2>
                        <p className="pw-result__quote">"{persona.quote}"</p>
                        <p className="pw-result__copy">{persona.description}</p>
                      </article>
                    );
                  })}
                </div>

                <div className="pw-result__actions">
                  {picked.length === 1 && (
                    <a
                      className="pw-result__cta"
                      href={wheelMatchLink(
                        typeof window !== 'undefined' ? window.location.origin : '',
                        picked[0],
                      )}
                    >
                      <Wand2 aria-hidden="true" /> Take the match quiz
                      <ArrowRight aria-hidden="true" />
                    </a>
                  )}
                  {picked.length === 2 && (
                    <a
                      className="pw-result__cta"
                      href={wheelBattleLink(
                        typeof window !== 'undefined' ? window.location.origin : '',
                        picked[0],
                        picked[1],
                      )}
                    >
                      <Swords aria-hidden="true" /> Start a battle
                      <ArrowRight aria-hidden="true" />
                    </a>
                  )}
                  {picked.length >= 2 && (
                    <Pressable
                      type="button"
                      className="pw-result__cta pw-result__cta--button"
                      onClick={onTryInArena}
                    >
                      <Users aria-hidden="true" /> Bring{' '}
                      {picked.length === 2 ? 'both' : 'all three'} into Arena
                      <ArrowRight aria-hidden="true" />
                    </Pressable>
                  )}
                  <MotionButton
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={onShare}
                    icon={<Share2 aria-hidden="true" />}
                  >
                    {copied ? 'Link copied' : 'Share spin'}
                  </MotionButton>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="pw-spin-cta" aria-label="Spin again">
          <MotionButton
            type="button"
            variant="primary"
            size="lg"
            onClick={onSpin}
            disabled={spinning}
            icon={<RefreshCw aria-hidden="true" />}
          >
            {spinning ? 'Spinning…' : picked.length === 0 ? 'Spin the wheel' : 'Spin again'}
          </MotionButton>
          <button
            type="button"
            className={`pw-audio-toggle${audioOn ? ' pw-audio-toggle--on' : ''}`}
            onClick={() => setAudioOn((on) => !on)}
            aria-label={audioOn ? 'Mute wheel sounds' : 'Unmute wheel sounds'}
            aria-pressed={audioOn}
          >
            {audioOn ? '🔊 Sound on' : '🔇 Sound off'}
          </button>
          {sharedSeed && (
            <p className="pw-spin-cta__note">
              Shared seed <code>{sharedSeed}</code> · spin again for a new combo
            </p>
          )}
        </section>

        <section className="pw-progress" aria-label="Discovery progress">
          <div className="pw-progress__head">
            <p className="pw-progress__label">
              You've met {discoveredCount} of {totalPersonas} minds
            </p>
            <p className="pw-progress__percent">
              {Math.round((discoveredCount / totalPersonas) * 100)}%
            </p>
          </div>
          <div
            className="pw-progress__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalPersonas}
            aria-valuenow={discoveredCount}
            aria-label="Personas discovered on the wheel"
          >
            <div
              className="pw-progress__fill"
              style={{ width: `${(discoveredCount / totalPersonas) * 100}%` }}
            />
          </div>
          <ul className="pw-progress__chips" aria-label="Discovered personas">
            {PERSONAS.map((p) => {
              const met = discovered.includes(p.id);
              return (
                <li
                  key={p.id}
                  className={`pw-progress__chip${met ? ' pw-progress__chip--met' : ''}`}
                  style={{ ['--pw-chip-color' as string]: p.color }}
                  title={met ? `Met ${p.name}` : `Not yet met: ${p.name}`}
                  aria-label={met ? `${p.name} discovered` : `${p.name} not yet met`}
                >
                  <span className="pw-progress__chip-dot" aria-hidden="true" />
                  <span className="pw-progress__chip-name">{p.name}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {history.length > 0 && (
          <section className="pw-history" aria-label="Recent spins">
            <div className="pw-history__head">
              <p className="pw-history__label">
                <History aria-hidden="true" /> Recent spins
              </p>
              <button
                type="button"
                className="pw-history__clear"
                onClick={onClearHistory}
                aria-label="Clear spin history"
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
            <ul>
              {history.slice(0, 8).map((entry) => {
                const names = entry.personaIds
                  .map((id) => findPersona(id)?.name ?? id)
                  .join(' vs ');
                return (
                  <li key={entry.id}>
                    <Pressable
                      type="button"
                      className="pw-history__item"
                      onClick={() => onReplayHistory(entry)}
                      disabled={spinning}
                    >
                      <span className="pw-history__mode">{entry.mode}</span>
                      <span className="pw-history__names">{names}</span>
                      <span className="pw-history__time">{timeAgo(entry.savedAt)}</span>
                    </Pressable>
                  </li>
                );
              })}
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
