import { useEffect } from 'react';
import { BUSY_LEAVE_MESSAGE, shouldWarnOnLeave } from '../lib/busyNavigationGuard';

/**
 * Registers `beforeunload` while `busy` is true so reloads/tab closes
 * warn about in-flight Arena or Agent work.
 */
export function useBusyNavigationGuard(busy: boolean, message = BUSY_LEAVE_MESSAGE): void {
  useEffect(() => {
    if (!shouldWarnOnLeave(busy)) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chromium requires returnValue to be set for the dialog to show.
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [busy, message]);
}
