import { useCallback, useEffect, useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import {
  readRecentCategories,
  clearRecentCategories,
} from '../lib/recentCategories';
import {
  personaPlaygroundCategoryLabel,
  type PersonaPlaygroundCategory,
} from '../data/personaPlayground';

export interface RecentlyUsedCategoriesProps {
  /** Heading shown above the widget. */
  heading?: string;
  /** Callback fired when the user picks a recent category. */
  onPick?: (category: PersonaPlaygroundCategory) => void;
}

const STORAGE_KEY = 'arena:persona-playground:recent-categories:v1';

/**
 * "Recently used categories" widget — surfaces the last few
 * category filters the user applied, as 1-click chips. Cold-start
 * hidden (no prior picks) so first-time visitors don't see a
 * meaningless empty row. Subscribes to the storage event for
 * cross-tab sync.
 */
export function RecentlyUsedCategories({
  heading = 'Recently used categories',
  onPick,
}: RecentlyUsedCategoriesProps) {
  const [categories, setCategories] = useState<readonly PersonaPlaygroundCategory[]>([]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setCategories(readRecentCategories(window.localStorage));
  }, []);

  useEffect(() => {
    refresh();
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  if (categories.length === 0) return null;

  return (
    <section className="ppg-recentcats" aria-label={heading}>
      <header className="ppg-recentcats__head">
        <p className="ppg-recentcats__eyebrow">
          <Clock aria-hidden="true" /> {heading}
          <kbd className="ppg-recentcats__shortcut" aria-hidden="true">
            Shift + C
          </kbd>
        </p>
        <button
          type="button"
          className="ppg-recentcats__clear"
          onClick={() => {
            if (typeof window === 'undefined') return;
            clearRecentCategories(window.localStorage);
            setCategories([]);
          }}
          aria-label="Clear recent categories"
        >
          <Trash2 aria-hidden="true" />
          <span>Clear</span>
        </button>
      </header>
      <ul className="ppg-recentcats__list">
        {categories.map((cat) => (
          <li key={cat} className="ppg-recentcats__item">
            <button
              type="button"
              className="ppg-recentcats__chip"
              onClick={() => onPick?.(cat)}
              aria-label={`Filter to ${personaPlaygroundCategoryLabel(cat)}`}
            >
              {personaPlaygroundCategoryLabel(cat)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RecentlyUsedCategories;