import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ProfileModalOrigin = 'top-right' | 'bottom-left';

export type ProfileModalTab = 'account' | 'plan' | 'usage' | 'integrations' | 'help';

export interface ProfileModalContextType {
  isOpen: boolean;
  closing: boolean;
  origin: ProfileModalOrigin;
  activeTab: ProfileModalTab;
  openModal: (origin: ProfileModalOrigin, tab?: ProfileModalTab) => void;
  /** Plays exit animation (220ms), then clears `isOpen` and runs optional callback */
  closeModal: (after?: () => void) => void;
  setActiveTab: (tab: ProfileModalTab) => void;
}

const ProfileModalContext = createContext<ProfileModalContextType | undefined>(undefined);

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [origin, setOrigin] = useState<ProfileModalOrigin>('top-right');
  const [activeTab, setActiveTab] = useState<ProfileModalTab>('account');
  const isOpenRef = useRef(false);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const closeModal = useCallback((after?: () => void) => {
    if (!isOpenRef.current) {
      after?.();
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setIsOpen(false);
      after?.();
    }, 220);
  }, []);

  const openModal = useCallback((nextOrigin: ProfileModalOrigin, tab?: ProfileModalTab) => {
    setClosing(false);
    setOrigin(nextOrigin);
    if (tab) setActiveTab(tab);
    setIsOpen(true);
  }, []);

  const value = useMemo<ProfileModalContextType>(
    () => ({
      isOpen,
      closing,
      origin,
      activeTab,
      openModal,
      closeModal,
      setActiveTab,
    }),
    [isOpen, closing, origin, activeTab, openModal, closeModal],
  );

  return (
    <ProfileModalContext.Provider value={value}>{children}</ProfileModalContext.Provider>
  );
}

export function useProfileModal(): ProfileModalContextType {
  const ctx = useContext(ProfileModalContext);
  if (!ctx) {
    throw new Error('useProfileModal must be used within ProfileModalProvider');
  }
  return ctx;
}
