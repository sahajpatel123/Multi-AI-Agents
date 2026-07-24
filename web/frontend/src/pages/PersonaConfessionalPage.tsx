import { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Lock,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MotionButton } from '../components/MotionButton';
import { Pressable } from '../components/Pressable';
import {
  appendUserEntry,
  buildConfessionalCouncil,
  clearUserEntries,
  confessionalShareUrl,
  getCuratedEntries,
  readUserEntries,
  removeUserEntry,
  type ConfessionalCouncil,
  type ConfessionalEntry,
} from '../data/personaConfessional';
import { PERSONAS } from '../data/personas';
import { useAuth } from '../hooks/useAuth';
import { copyToClipboard } from '../lib/clipboard';
import { prefersReducedMotion } from '../lib/motion';
import '../styles/persona-confessional-page.css';

const MAX_PROMPT_CHARS = 600;

function findPersona(id: string) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

export function PersonaConfessionalPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduceMotion = prefersReducedMotion();
  const [searchParams] = useSearchParams();
  const sharedPrompt = searchParams.get('prompt') ?? '';

  const [selectedEntry, setSelectedEntry] = useState<ConfessionalEntry | null>(null);
  const [submitPrompt, setSubmitPrompt] = useState(sharedPrompt);
  const [pageVisible, setPageVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userEntries, setUserEntries] = useState<ReadonlyArray<ConfessionalEntry>>([]);

  useEffect(() => {
    setPageVisible(true);
    setUserEntries(readUserEntries());
  }, []);

  const curated = useMemo(() => getCuratedEntries(), []);

  // The displayed council — either a shared prompt from the URL, or
  // the selected entry, or nothing.
  const sharedCouncil: ConfessionalCouncil | null = useMemo(() => {
    if (!sharedPrompt.trim()) return null;
    return buildConfessionalCouncil(sharedPrompt);
  }, [sharedPrompt]);

  const selectedCouncil: ConfessionalCouncil | null = useMemo(() => {
    if (!selectedEntry) return null;
    return buildConfessionalCouncil(selectedEntry.prompt);
  }, [selectedEntry]);

  const onSubmit = () => {
    if (!submitPrompt.trim()) return;
    const entry: ConfessionalEntry = {
      id: `you-${Date.now()}`,
      label: 'Your submission',
      prompt: submitPrompt.trim(),
      roastLabel: 'Awaiting verdict',
      roastDetail: 'You added this to the wall. Submit again to update.',
      submittedAt: new Date().toISOString(),
      author: 'you',
    };
    appendUserEntry(entry);
    setUserEntries(readUserEntries());
    setSubmitPrompt('');
    setSelectedEntry(entry);
    if (typeof window !== 'undefined') {
      const url = confessionalShareUrl(window.location.origin, entry.prompt);
      window.history.replaceState({}, '', url);
    }
  };

  const onShare = async () => {
    if (typeof window === 'undefined') return;
    const target = selectedEntry?.prompt ?? sharedPrompt;
    if (!target) return;
    const url = confessionalShareUrl(window.location.origin, target);
    const text = `Arena Confessional — does this prompt deserve better? Run it:`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Arena Persona Confessional', text, url });
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

  const onRemove = (id: string) => {
    removeUserEntry(id);
    setUserEntries(readUserEntries());
    if (selectedEntry?.id === id) setSelectedEntry(null);
  };

  const onTryInArena = () => {
    const target = selectedEntry?.prompt ?? sharedPrompt;
    if (typeof window === 'undefined' || !target) return;
    const link = `/app?prompt=${encodeURIComponent(`Improve this prompt: ${target}`)}`;
    if (isAuthenticated) {
      navigate(link);
      return;
    }
    navigate(link);
  };

  const onResetSelection = () => {
    setSelectedEntry(null);
    if (typeof window !== 'undefined') {
      const url = confessionalShareUrl(window.location.origin, '');
      window.history.replaceState({}, '', url);
    }
  };

  const onClearAll = () => {
    clearUserEntries();
    setUserEntries([]);
    setSelectedEntry(null);
  };

  const activeCouncil = selectedCouncil ?? sharedCouncil;
  const activeEntry = selectedEntry;

  return (
    <div className={`pcf-page${pageVisible ? ' pcf-page--enter' : ''}`}>
      <Navbar />

      <main
        id="main-content"
        className={`pcf-main${reduceMotion ? '' : ' pcf-main--enter'}`}
        tabIndex={-1}
        aria-labelledby="pcf-title"
      >
        <section className="pcf-hero">
          <p className="pcf-hero__eyebrow">
            <Lock aria-hidden="true" /> Persona Confessional
          </p>
          <h1 id="pcf-title" className="pcf-hero__title">
            <span>The anonymous wall</span>
            <span className="pcf-hero__title-accent">of bad prompts.</span>
          </h1>
          <p className="pcf-hero__lede">
            A safe place to admit the prompt that almost shipped. Each
            confessional gets a 4-mind verdict. Same prompt in
            produces the same verdict — share the roast.
          </p>
        </section>

        <section className="pcf-wall" aria-label="Confessional wall">
          <h2 className="pcf-wall__heading">
            <Flame aria-hidden="true" /> The Wall
          </h2>
          <ul className="pcf-wall__list">
            {curated.map((entry) => {
              const isActive = selectedEntry?.id === entry.id;
              return (
                <li key={entry.id}>
                  <Pressable
                    type="button"
                    className={`pcf-entry${isActive ? ' pcf-entry--active' : ''}`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <span className="pcf-entry__badge">Curated</span>
                    <span className="pcf-entry__label">{entry.label}</span>
                    <span className="pcf-entry__prompt">
                      "{entry.prompt.slice(0, 80)}{entry.prompt.length > 80 ? '...' : ''}"
                    </span>
                    <span className="pcf-entry__roast">{entry.roastLabel}</span>
                  </Pressable>
                </li>
              );
            })}
            {userEntries.map((entry) => {
              const isActive = selectedEntry?.id === entry.id;
              return (
                <li key={entry.id}>
                  <Pressable
                    type="button"
                    className={`pcf-entry pcf-entry--user${isActive ? ' pcf-entry--active' : ''}`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <span className="pcf-entry__badge pcf-entry__badge--user">
                      You
                    </span>
                    <span className="pcf-entry__label">{entry.label}</span>
                    <span className="pcf-entry__prompt">
                      "{entry.prompt.slice(0, 80)}{entry.prompt.length > 80 ? '...' : ''}"
                    </span>
                    <span className="pcf-entry__roast">{entry.roastLabel}</span>
                    <button
                      type="button"
                      className="pcf-entry__remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(entry.id);
                      }}
                      aria-label={`Remove ${entry.label}`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </Pressable>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="pcf-submit" aria-label="Submit your own">
          <h3 className="pcf-submit__heading">
            <Send aria-hidden="true" /> Submit your own (anonymous)
          </h3>
          <textarea
            className="pcf-submit__textarea"
            value={submitPrompt}
            onChange={(e) => setSubmitPrompt(e.target.value)}
            placeholder="Paste a prompt you've been about to send. The panel will verdict it."
            maxLength={MAX_PROMPT_CHARS}
            rows={3}
            aria-label="Your prompt to confess"
          />
          <div className="pcf-submit__meta">
            <span>
              {submitPrompt.length}/{MAX_PROMPT_CHARS} chars
            </span>
            <div className="pcf-submit__actions">
              <button
                type="button"
                className="pcf-submit__reset"
                onClick={onResetSelection}
                disabled={!selectedEntry && !sharedPrompt}
              >
                <RotateCcw aria-hidden="true" /> Reset selection
              </button>
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onSubmit}
                disabled={!submitPrompt.trim() || submitPrompt.trim().length < 8}
                icon={<Send aria-hidden="true" />}
              >
                Add to the wall
              </MotionButton>
            </div>
          </div>
          {userEntries.length > 0 && (
            <button
              type="button"
              className="pcf-submit__clear"
              onClick={onClearAll}
              aria-label="Clear all your confessional entries"
            >
              <X aria-hidden="true" /> Clear all your entries
            </button>
          )}
        </section>

        {activeCouncil && (
          <section className="pcf-verdict" aria-label="Confessional verdict">
            <header className="pcf-verdict__head">
              <p className="pcf-verdict__kicker">
                <Swords aria-hidden="true" /> The panel has spoken
              </p>
              <h2 className="pcf-verdict__title">
                {activeEntry
                  ? `Verdict on "${activeEntry.label}"`
                  : 'Verdict on the shared prompt'}
              </h2>
              {activeEntry && (
                <p className="pcf-verdict__detail">{activeEntry.roastDetail}</p>
              )}
            </header>

            <blockquote className="pcf-verdict__prompt">
              "{activeCouncil.prompt}"
            </blockquote>

            <ol className="pcf-verdict__list">
              {activeCouncil.perspectives.map((p) => {
                const persona = findPersona(p.personaId);
                if (!persona) return null;
                return (
                  <li
                    key={p.personaId}
                    className="pcf-angle"
                    style={{
                      ['--pcf-persona-color' as string]: persona.color,
                      ['--pcf-persona-bg' as string]: persona.bgTint,
                    }}
                  >
                    <header className="pcf-angle__head">
                      <span className="pcf-angle__dot" aria-hidden="true" />
                      <div>
                        <p className="pcf-angle__name">{p.angle}</p>
                        <p className="pcf-angle__quote">"{persona.quote}"</p>
                      </div>
                    </header>
                    <p className="pcf-angle__line">{p.line}</p>
                  </li>
                );
              })}
            </ol>

            <div className="pcf-verdict__actions">
              <MotionButton
                type="button"
                variant="primary"
                size="md"
                onClick={onTryInArena}
                icon={<Sparkles aria-hidden="true" />}
              >
                Improve this prompt in Arena
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
      </main>

      <Footer />
    </div>
  );
}