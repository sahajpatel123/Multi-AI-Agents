import { useEffect } from 'react';
import { applyAbsoluteDocumentTitle, applyDocumentTitle } from '../lib/documentTitle';

/**
 * While `busy`, set a live document title; restore the route title when idle or unmounting.
 * DocumentTitle only reacts to pathname changes, so this overlay is safe during long runs.
 */
export function useBusyDocumentTitle(
  busy: boolean,
  titleWhenBusy: string,
  restorePath: string,
): void {
  useEffect(() => {
    if (!busy) {
      applyDocumentTitle(restorePath);
      return;
    }
    applyAbsoluteDocumentTitle(titleWhenBusy);
    return () => {
      applyDocumentTitle(restorePath);
    };
  }, [busy, titleWhenBusy, restorePath]);
}
