import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { DEFAULT_PANEL, type Persona } from '../data/personas';

type SlotIndex = 0 | 1 | 2 | 3;

interface PanelContextValue {
  panel: Persona[];
  swapAgent: (slotIndex: SlotIndex, newPersona: Persona) => void;
  resetPanel: () => void;
  isDefaultPanel: boolean;
}

const PanelContext = createContext<PanelContextValue | undefined>(undefined);

function cloneDefaultPanel() {
  return DEFAULT_PANEL.map((persona) => ({ ...persona }));
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Persona[]>(() => cloneDefaultPanel());

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

  const isDefaultPanel = useMemo(
    () => panel.every((persona, index) => persona.id === DEFAULT_PANEL[index]?.id),
    [panel],
  );

  return createElement(
    PanelContext.Provider,
    {
      value: {
        panel,
        swapAgent,
        resetPanel,
        isDefaultPanel,
      },
    },
    children,
  );
}

export function usePanel() {
  const context = useContext(PanelContext);

  if (!context) {
    throw new Error('usePanel must be used within a PanelProvider');
  }

  return context;
}
