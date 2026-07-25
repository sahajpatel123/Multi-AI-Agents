import { useEffect } from 'react';
import { recordRecentTool } from '../lib/recentTools';

/**
 * Records the given path to the recent-tools localStorage entry on
 * mount. Safe to call on every page render — `recordRecentTool`
 * dedupes and the storage is the source of truth.
 */
export function useRecordRecentTool(path: string): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    recordRecentTool(window.localStorage, path);
  }, [path]);
}
