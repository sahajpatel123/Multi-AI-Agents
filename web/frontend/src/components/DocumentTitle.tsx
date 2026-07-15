import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyDocumentTitle } from '../lib/documentTitle';

/** Keeps `document.title` in sync with the active route. */
export function DocumentTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    applyDocumentTitle(pathname);
  }, [pathname]);

  return null;
}

export default DocumentTitle;
