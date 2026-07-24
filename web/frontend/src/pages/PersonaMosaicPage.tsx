import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  RefreshCw,
  Share2,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import { PERSONAS } from '../data/personas';
import {
  buildMosaic,
  mosaicShareUrl,
} from '../data/personaMosaic';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/persona-mosaic-page.css';

const REQUIRED_SLOTS = 4;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

function parsePersonaIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => PERSONAS.some((p) => p.id === s));
}

function pickDefaultFour(): string[] {
  // Curated opening: four contrasting minds that produce a strong
  // "balanced" mosaic on first load.
  return ['analyst', 'empath', 'engineer', 'contrarian'];
}

export function PersonaMosaicPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const initialPicked = parsePersonaIds(searchParams.get('p'));

  const [picked, setPicked] = useState<ReadonlyArray<string>>(
    initialPicked.length === REQUIRED_SLOTS ? initialPicked : pickDefaultFour(),
  );
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPageVisible(true);
  }, []);

  const mosaic = useMemo(() => buildMosaic(picked), [picked]);
  const isComplete = picked.length === REQUIRED_SLOTS;
  const distinct = useMemo(() => new Set(picked).size === picked.length, [picked]);

  const updateSlot = (slotIndex: number, personaId: string) => {
    setPicked((prev) => {
      const next = [...prev];
      // If the persona is already in another slot, swap them so we never
      // have duplicates. This is what users expect when picking.
      const existingIdx = next.findIndex((id) => id === personaId);
      if (existingIdx >= 0 && existingIdx !== slotIndex) {
        next[existingIdx] = next[slotIndex];
      }
      next[slotIndex] = personaId;
      return next;
    });
  };

  const onAutoFill = () => {
    // Pick 4 distinct personas with maximally contrasting temperatures.
    const sorted = [...PERSONAS].sort((a, b) => a.temperature - b.temperature);
    const picks = [
      sorted[0].id,
      sorted[Math.floor(sorted.length / 3)].id,
      sorted[Math.floor((2 * sorted.length) / 3)].id,
      sorted[sorted.length - 1].id,
    ];
    setPicked(picks);
  };

  const onClear = () => setPicked([]);

  const onShare = async () => {
    if (typeof window === 'undefined' || !mosaic) return;
    const url = mosaicShareUrl(window.location.origin, picked);
    const text = `My Arena mosaic: ${mosaic.houseName}. ${mosaic.tagline}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Mosaic', text, url });
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
    if (typeof window === 'undefined' || picked.length === 0) return;
    const seed = picked.map((id) => `seedPersona=${id}`).join('&');
    const link = `/app?${seed}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    setRedirectIntent(link);
    navigate('/signin?tab=signup');
  };

  return (
    <div className={`pmos-page${pageVisible ? ' pmos-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pmos-main${reduceMotion ? '' : ' pmos-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pmos-title"
      >
        <section className="pmos-hero">
          <p className="pmos-hero__eyebrow">Persona Mosaic</p>
          <h1 id="pmos-title" className="pmos-hero__title">
            <span>Four minds.</span>
            <span className="pmos-hero__title-accent">One house style.</span>
          </h1>
          <p className="pmos-hero__lede">
            Pick any four of the sixteen Arena minds and Arena names the
            team. Every combination produces a unique house style,
            tagline, manifesto, and a question the team is built to
            answer — shareable, deterministic, and yours to take into Arena.
          </p>
        </section>

        <section className="pmos-slots" aria-label="Mosaic slots">
          <div className="pmos-slots__head">
            <p className="pmos-slots__label">
              <Users aria-hidden="true" /> Pick four minds
            </p>
            <div className="pmos-slots__actions">
              <Pressable
                type="button"
                className="pmos-slots__auto"
                onClick={onAutoFill}
              >
                <RefreshCw aria-hidden="true" /> Auto-pick
              </Pressable>
              <button
                type="button"
                className="pmos-slots__clear"
                onClick={onClear}
                disabled={picked.length === 0}
              >
                <X aria-hidden="true" /> Clear
              </button>
            </div>
          </div>
          <div className="pmos-slots__grid">
            {[0, 1, 2, 3].map((slotIndex) => {
              const personaId = picked[slotIndex];
              const persona = personaId ? findPersona(personaId) : null;
              return (
                <label
                  key={slotIndex}
                  className="pmos-slot"
                  style={
                    persona
                      ? {
                          ['--pmos-slot-color' as string]: persona.color,
                          ['--pmos-slot-bg' as string]: persona.bgTint,
                        }
                      : undefined
                  }
                >
                  <span className="pmos-slot__number">Slot {slotIndex + 1}</span>
                  <select
                    className="pmos-slot__select"
                    value={personaId ?? ''}
                    onChange={(e) => updateSlot(slotIndex, e.target.value)}
                    aria-label={`Slot ${slotIndex + 1} persona`}
                  >
                    <option value="">Pick a mind…</option>
                    {PERSONAS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="pmos-slot__quote">
                    "{persona?.quote ?? '—'}"
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="pmos-result" aria-label="Mosaic result">
          {mosaic && isComplete && distinct ? (
            <article className="pmos-card" data-temp={mosaic.tempLabel}>
              <header className="pmos-card__head">
                <p className="pmos-card__kicker">
                  <Compass aria-hidden="true" /> Your mosaic
                </p>
                <h2 className="pmos-card__name">{mosaic.houseName}</h2>
                <p className="pmos-card__tagline">{mosaic.tagline}</p>
              </header>

              <div className="pmos-card__lineup" aria-label="The four minds">
                {mosaic.personaIds.map((id) => {
                  const p = findPersona(id);
                  if (!p) return null;
                  return (
                    <span
                      key={id}
                      className="pmos-card__chip"
                      style={{ ['--pmos-chip-color' as string]: p.color }}
                      title={p.quote}
                    >
                      <span className="pmos-card__chip-dot" aria-hidden="true" />
                      <span className="pmos-card__chip-name">{p.name}</span>
                      <span className="pmos-card__chip-temp">
                        T{p.temperature.toFixed(1)}
                      </span>
                    </span>
                  );
                })}
              </div>

              <div className="pmos-card__manifesto" aria-label="Team manifesto">
                <p className="pmos-card__manifesto-headline">
                  {mosaic.manifesto[0]?.headline}
                </p>
                <ul>
                  {mosaic.manifesto.map((entry, index) => (
                    <li key={index}>
                      <span className="pmos-card__manifesto-bullet">
                        <Check aria-hidden="true" />
                      </span>
                      <span>{entry.bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pmos-card__question" aria-label="Best question for this team">
                <p className="pmos-card__question-label">
                  <Sparkles aria-hidden="true" /> Best question for this team
                </p>
                <blockquote className="pmos-card__question-quote">
                  "{mosaic.bestQuestion}"
                </blockquote>
              </div>

              <div className="pmos-card__actions">
                <MotionButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={onTryInArena}
                  icon={<Swords aria-hidden="true" />}
                >
                  Bring all four into Arena
                </MotionButton>
                <MotionButton
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={onShare}
                  icon={<Share2 aria-hidden="true" />}
                >
                  {copied ? 'Link copied' : 'Share mosaic'}
                </MotionButton>
                <a href="/personas" className="pmos-card__link">
                  Browse all 16 minds <ArrowRight aria-hidden="true" />
                </a>
              </div>
            </article>
          ) : (
            <div className="pmos-empty">
              <p>Pick four distinct minds to generate the mosaic.</p>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}