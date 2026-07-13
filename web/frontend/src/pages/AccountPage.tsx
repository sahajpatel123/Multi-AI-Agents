import { useEffect } from 'react';
import { useProfileModal } from '../context/ProfileModalContext';

/** Legacy `/account` route: opens the universal profile modal (no standalone UI). */
export function AccountPage() {
  const { openModal } = useProfileModal();
  useEffect(() => {
    openModal('top-right', 'account');
  }, [openModal]);
  return null;
}
