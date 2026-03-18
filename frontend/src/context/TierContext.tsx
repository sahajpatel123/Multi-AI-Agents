import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getUserTier } from '../api';
import { useAuth } from '../hooks/useAuth';
import type { TierFeatures, TierStatus } from '../types';

type TierContextType = {
  tier: string;
  dailyLimit: number;
  messagesUsed: number;
  messagesRemaining: number;
  allowedPersonas: string[];
  features: TierFeatures;
  isPlus: boolean;
  isPro: boolean;
  isFree: boolean;
  canUsePersona: (personaId: string) => boolean;
  canUseFeature: (feature: string) => boolean;
  refreshTier: () => Promise<void>;
};

const FREE_PERSONAS = [
  'analyst',
  'philosopher',
  'pragmatist',
  'contrarian',
  'futurist',
  'empath',
];

const guestDefaults: TierStatus = {
  tier: 'GUEST',
  daily_limit: 3,
  messages_used_today: 0,
  messages_remaining: 3,
  allowed_personas: FREE_PERSONAS,
  features: {
    debate: false,
    discuss: false,
    memory: false,
    saved_responses: false,
    agent_mode: false,
    scoring_audit: false,
  },
  upgrade_to: 'plus',
};

const freeDefaults: TierStatus = {
  ...guestDefaults,
  tier: 'FREE',
  daily_limit: 5,
  messages_remaining: 5,
};

const fallbackTierValue: TierContextType = {
  tier: 'FREE',
  dailyLimit: 5,
  messagesUsed: 0,
  messagesRemaining: 5,
  allowedPersonas: FREE_PERSONAS,
  features: freeDefaults.features,
  isPlus: false,
  isPro: false,
  isFree: true,
  canUsePersona: (personaId: string) => FREE_PERSONAS.includes(personaId),
  canUseFeature: () => false,
  refreshTier: async () => {},
};

const TierContext = createContext<TierContextType>(fallbackTierValue);

export function TierProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [tierData, setTierData] = useState<TierStatus>(guestDefaults);

  const refreshTier = useCallback(async () => {
    if (!isAuthenticated) {
      setTierData(guestDefaults);
      return;
    }

    try {
      const data = await getUserTier();
      setTierData(data || freeDefaults);
    } catch {
      setTierData(freeDefaults);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshTier();
  }, [refreshTier]);

  const value = useMemo<TierContextType>(() => {
    const canUsePersona = (personaId: string) => tierData.allowed_personas.includes(personaId);
    const canUseFeature = (feature: string) => {
      return tierData.features[feature as keyof TierFeatures] ?? false;
    };

    return {
      tier: tierData.tier,
      dailyLimit: tierData.daily_limit,
      messagesUsed: tierData.messages_used_today,
      messagesRemaining: tierData.messages_remaining,
      allowedPersonas: tierData.allowed_personas,
      features: tierData.features,
      isPlus: tierData.tier === 'PLUS',
      isPro: tierData.tier === 'PRO',
      isFree: tierData.tier === 'FREE' || tierData.tier === 'GUEST',
      canUsePersona,
      canUseFeature,
      refreshTier,
    };
  }, [refreshTier, tierData]);

  return createElement(TierContext.Provider, { value }, children);
}

export function useTier() {
  return useContext(TierContext);
}
