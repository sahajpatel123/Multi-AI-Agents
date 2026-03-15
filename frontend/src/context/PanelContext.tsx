import {
  createContext,
  createElement,
  useEffect,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { getPanel, getPersonas, savePanel as savePanelRequest, type SavedPanel } from '../api';
import { useAuth } from '../hooks/useAuth';
import { DEFAULT_PANEL, PERSONAS, type Persona } from '../data/personas';

type SlotIndex = 0 | 1 | 2 | 3;

interface PanelContextValue {
  panel: Persona[];
  personas: Persona[];
  swapAgent: (slotIndex: SlotIndex, newPersona: Persona) => void;
  resetPanel: () => void;
  savePanel: () => Promise<void>;
  isDefaultPanel: boolean;
}

const PanelContext = createContext<PanelContextValue | undefined>(undefined);

function cloneDefaultPanel() {
  return DEFAULT_PANEL.map((persona) => ({ ...persona }));
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [panel, setPanel] = useState<Persona[]>(() => cloneDefaultPanel());
  const [personas, setPersonas] = useState<Persona[]>(PERSONAS.map((persona) => ({ ...persona })));

  useEffect(() => {
    let cancelled = false;

    void getPersonas()
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((persona, index) => ({
          id: persona.persona_id,
          name: persona.name,
          color: persona.color,
          bgTint: persona.bg_tint,
          quote: persona.quote,
          description: persona.description,
          temperature: persona.temperature,
          locked: persona.is_locked,
          slot: index < 4 ? ((index + 1) as 1 | 2 | 3 | 4) : null,
        }));
        setPersonas(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setPersonas(PERSONAS.map((persona) => ({ ...persona })));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    let cancelled = false;

    void getPanel()
      .then((savedPanel) => {
        if (cancelled) return;
        setPanel(buildPanelFromSlots(savedPanel, personas));
      })
      .catch(() => {
        if (!cancelled) setPanel(cloneDefaultPanel());
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, personas]);

  const swapAgent = (slotIndex: SlotIndex, newPersona: Persona) => {
    setPanel((prev) => {
      const nextPanel = [...prev];
      const existingIndex = prev.findIndex((persona) => persona.id === newPersona.id);
      const currentPersona = prev[slotIndex];

      nextPanel[slotIndex] = {
        ...newPersona,
        slot: (slotIndex + 1) as 1 | 2 | 3 | 4,
      };

      if (existingIndex >= 0 && existingIndex !== slotIndex) {
        nextPanel[existingIndex] = {
          ...currentPersona,
          slot: (existingIndex + 1) as 1 | 2 | 3 | 4,
        };
      }

      return nextPanel;
    });
  };

  const resetPanel = () => {
    setPanel(cloneDefaultPanel());
  };

  const savePanel = async () => {
    const payload: SavedPanel = {
      slot_1: panel[0]?.id || DEFAULT_PANEL[0].id,
      slot_2: panel[1]?.id || DEFAULT_PANEL[1].id,
      slot_3: panel[2]?.id || DEFAULT_PANEL[2].id,
      slot_4: panel[3]?.id || DEFAULT_PANEL[3].id,
    };
    await savePanelRequest(payload);
  };

  const isDefaultPanel = useMemo(
    () => panel.every((persona, index) => persona.id === DEFAULT_PANEL[index]?.id),
    [panel],
  );

  return createElement(
    PanelContext.Provider,
    {
      value: {
        panel,
        personas,
        swapAgent,
        resetPanel,
        savePanel,
        isDefaultPanel,
      },
    },
    children,
  );
}

function buildPanelFromSlots(savedPanel: SavedPanel, library: Persona[]): Persona[] {
  const byId = new Map(library.map((persona) => [persona.id, persona]));
  const ids = [savedPanel.slot_1, savedPanel.slot_2, savedPanel.slot_3, savedPanel.slot_4];
  return ids.map((id, index) => ({
    ...(byId.get(id) || DEFAULT_PANEL[index]),
    slot: (index + 1) as 1 | 2 | 3 | 4,
  }));
}

export function usePanel() {
  const context = useContext(PanelContext);

  if (!context) {
    throw new Error('usePanel must be used within a PanelProvider');
  }

  return context;
}
