import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { AgentDot } from '../components/AgentDot';
import { usePanel } from '../context/PanelContext';
import { type Persona } from '../data/personas';

type SlotIndex = 0 | 1 | 2 | 3;

interface ToastState {
  message: string;
  color: string;
  iconColor?: string;
}

const eyebrowStyle = {
  fontSize: '12px',
  letterSpacing: '.12em',
  textTransform: 'uppercase' as const,
  color: '#6B6460',
};

export function PersonasPage() {
  const navigate = useNavigate();
  const { panel, personas, swapAgent, resetPanel, savePanel, isDefaultPanel } = usePanel();
  const [pageVisible, setPageVisible] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotIndex | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [revealedLibraryIds, setRevealedLibraryIds] = useState<Record<string, boolean>>({});
  const libraryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const slotLabels = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'] as const;
  const activePersona = activeSlot !== null ? panel[activeSlot] : null;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setPageVisible(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (activeSlot === null) {
      setModalVisible(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => setModalVisible(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSlot]);

  useEffect(() => {
    if (!toast) return;

    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2500);
    const removeTimer = window.setTimeout(() => setToast(null), 2800);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [toast]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setRevealedLibraryIds((prev) => {
          const next = { ...prev };
          let changed = false;

          for (const entry of entries) {
            const id = entry.target.getAttribute('data-persona-id');
            if (entry.isIntersecting && id && !next[id]) {
              next[id] = true;
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      },
      { threshold: 0.16 },
    );

    Object.values(libraryRefs.current).forEach((node) => {
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, []);

  const unlockedSlotMap = useMemo(
    () =>
      panel.reduce<Record<string, number>>((acc, persona, index) => {
        acc[persona.id] = index + 1;
        return acc;
      }, {}),
    [panel],
  );

  const modalOptions = useMemo(() => {
    if (activePersona === null) return [];
    return personas.filter((persona) => persona.id !== activePersona.id);
  }, [activePersona, personas]);

  const closeModal = () => {
    setModalVisible(false);
    window.setTimeout(() => setActiveSlot(null), 220);
  };

  const handleSwap = (slotIndex: SlotIndex, persona: Persona) => {
    swapAgent(slotIndex, persona);
    setToast({ message: `${persona.name} added to slot ${slotIndex + 1}`, color: '#1A1714', iconColor: persona.color });
    closeModal();
  };

  const handleSavePanel = async () => {
    try {
      await savePanel();
      setToast({ message: 'Panel saved — loads every session', color: '#1A1714', iconColor: '#C4956A' });
    } catch {
      setToast({ message: 'Could not save panel', color: '#E57373', iconColor: '#FAF7F4' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F4' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <Navbar />

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '4rem 24px 5rem' }}>
        <button
          type="button"
          onClick={() => navigate('/app')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px',
            color: '#6B6460',
            background: '#F0EBE3',
            border: '0.5px solid #E0D8D0',
            borderRadius: '999px',
            padding: '7px 16px',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            marginBottom: '1.5rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#E0D8D0';
            e.currentTarget.style.color = '#1A1714';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F0EBE3';
            e.currentTarget.style.color = '#6B6460';
          }}
        >
          ← Back to Arena
        </button>

        <section
          style={{
            opacity: pageVisible ? 1 : 0,
            transform: pageVisible ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 450ms ease, transform 450ms ease',
            marginBottom: '3rem',
          }}
        >
          <p style={eyebrowStyle}>Your panel</p>
          <h1 style={{ marginTop: '1rem', fontSize: '48px', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1.02, color: '#1A1714' }}>
            <span style={{ display: 'block' }}>Build your</span>
            <span style={{ display: 'block', color: '#C4956A', fontStyle: 'italic' }}>four minds.</span>
          </h1>
          <p style={{ marginTop: '1rem', fontSize: '14px', color: '#6B6460', lineHeight: 1.75, maxWidth: '460px' }}>
            Your current panel loads by default. Swap any agent with another from the library for this session.
          </p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <p style={{ ...eyebrowStyle, marginBottom: '1rem' }}>Your current panel</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {panel.map((persona, index) => (
              <div
                key={`${persona.id}-${index}`}
                style={{
                  background: persona.bgTint,
                  border: '0.5px solid #E0D8D0',
                  borderRadius: '14px',
                  padding: '1.2rem',
                  position: 'relative',
                  minHeight: '140px',
                  opacity: pageVisible ? 1 : 0,
                  transform: pageVisible ? 'translateY(0)' : 'translateY(12px)',
                  transition: `opacity 420ms ease ${index * 60}ms, transform 420ms ease ${index * 60}ms`,
                }}
              >
                <div style={{ height: '2px', background: persona.color, borderRadius: '999px', marginBottom: '1rem' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AgentDot agentId={`agent_${index + 1}`} size={7} color={persona.color} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem', lineHeight: 1.6 }}>{persona.quote}</p>
                <div style={{ position: 'absolute', left: '1.2rem', bottom: '1.1rem', fontSize: '10px', color: '#6B6460', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  {slotLabels[index]}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSlot(index as SlotIndex)}
                  style={{
                    position: 'absolute',
                    right: '1.2rem',
                    bottom: '0.95rem',
                    fontSize: '11px',
                    color: '#C4956A',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 150ms ease',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#1A1714';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#C4956A';
                  }}
                >
                  Swap →
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.9rem' }}>
            <button
              type="button"
              onClick={handleSavePanel}
              style={{
                background: '#1A1714',
                color: '#FAF7F4',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 24px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Save this panel
            </button>
            {!isDefaultPanel && (
              <button
                type="button"
                onClick={resetPanel}
                style={{
                  fontSize: '12px',
                  color: '#6B6460',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#1A1714';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#6B6460';
                }}
              >
                Reset to default
              </button>
            )}
          </div>
        </section>

        <section>
          <p style={{ ...eyebrowStyle, margin: '3rem 0 1rem' }}>Full library · 16 personas</p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {personas.map((persona, index) => {
              const inSlot = unlockedSlotMap[persona.id];
              const isVisible = revealedLibraryIds[persona.id] || index < 4;

              return (
                <div
                  key={persona.id}
                  ref={(node) => {
                    libraryRefs.current[persona.id] = node;
                  }}
                  data-persona-id={persona.id}
                  style={{
                    background: persona.bgTint,
                    opacity: isVisible ? 1 : 0,
                    border: '0.5px solid #E0D8D0',
                    borderRadius: '14px',
                    padding: '1.2rem',
                    minHeight: '168px',
                    position: 'relative',
                    transform: isVisible ? 'translateY(0)' : 'translateY(16px)',
                    transition: `opacity 300ms ease ${index * 30}ms, transform 300ms ease ${index * 30}ms, box-shadow 200ms ease, background 150ms ease`,
                    boxShadow: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(26,23,20,0.07)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  <div style={{ height: '2px', background: persona.color, borderRadius: '999px', marginBottom: '1rem' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: persona.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem', lineHeight: 1.6 }}>
                    {persona.quote}
                  </p>
                  <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.6, marginTop: '.7rem' }}>
                    {persona.description}
                  </p>

                  {inSlot ? (
                    <div style={{ position: 'absolute', left: '1.2rem', bottom: '1rem' }}>
                      <span style={{ background: '#F0EBE3', color: '#6B6460', fontSize: '10px', padding: '3px 8px', borderRadius: '999px' }}>
                        In slot {inSlot}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {activeSlot !== null && activePersona && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(26,23,20,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#FAF7F4',
              borderRadius: '20px',
              padding: '2rem',
              maxWidth: '560px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              opacity: modalVisible ? 1 : 0,
              transform: modalVisible ? 'scale(1)' : 'scale(0.95)',
              transition: 'opacity 250ms ease, transform 250ms ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#1A1714' }}>Swap slot {activeSlot + 1}</h2>
                <p style={{ fontSize: '13px', color: '#6B6460', marginTop: '.35rem' }}>Currently: {activePersona.name}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: '#F0EBE3',
                  color: '#6B6460',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E0D8D0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#F0EBE3';
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>

            <div style={{ height: '0.5px', background: '#E0D8D0', margin: '1rem 0' }} />

            <p style={{ ...eyebrowStyle, marginBottom: '.8rem' }}>Available to swap</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              {modalOptions.map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => handleSwap(activeSlot, persona)}
                  style={{
                    background: persona.bgTint,
                    border: '0.5px solid #E0D8D0',
                    borderRadius: '12px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = persona.color;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#E0D8D0';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: persona.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1714' }}>{persona.name}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#6B6460', lineHeight: 1.5, marginTop: '.4rem' }}>{persona.description}</p>
                  <p style={{ fontSize: '11px', color: '#6B6460', fontStyle: 'italic', marginTop: '.4rem' }}>{persona.quote}</p>
                </button>
              ))}
            </div>

            <div style={{ height: '0.5px', background: '#E0D8D0', margin: '1rem 0' }} />
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '50%',
            transform: `translateX(-50%) translateY(${toastVisible ? '0' : '8px'})`,
            zIndex: 200,
            background: toast.color,
            color: '#FAF7F4',
            fontSize: '13px',
            padding: '10px 20px',
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: toastVisible ? 1 : 0,
            transition: 'opacity 300ms ease, transform 300ms ease',
          }}
        >
          <Sparkles style={{ width: '14px', height: '14px', color: toast.iconColor || '#FAF7F4' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: toast.iconColor || '#FAF7F4' }} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
