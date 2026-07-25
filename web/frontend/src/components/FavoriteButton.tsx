import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { isFavorited, toggleFavorite } from '../lib/favorites';

export interface FavoriteButtonProps {
  /** Catalog path, e.g. /persona-battle. */
  path: string;
  /** Visual size. Defaults to "sm" (button-sized). */
  size?: 'sm' | 'md';
  /** Override the initial state (useful for tests). */
  initialFavorited?: boolean;
}

/**
 * Star button that toggles a catalog path in the localStorage
 * favorites set. Renders a star outline when not favorited and a
 * filled star when favorited. Used on hub cards so users can
 * surface their favorites explicitly.
 */
export function FavoriteButton({
  path,
  size = 'sm',
  initialFavorited,
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState<boolean>(
    initialFavorited ?? false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initialFavorited === undefined) {
      setFavorited(isFavorited(window.localStorage, path));
    }
  }, [path, initialFavorited]);

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof window === 'undefined') return;
    const next = toggleFavorite(window.localStorage, path);
    setFavorited(next);
  };

  return (
    <button
      type="button"
      className={`ppg-fav-btn ppg-fav-btn--${size}${favorited ? ' ppg-fav-btn--on' : ''}`}
      onClick={onClick}
      aria-label={favorited ? `Remove ${path} from favorites` : `Add ${path} to favorites`}
      aria-pressed={favorited}
    >
      <Star
        aria-hidden="true"
        fill={favorited ? 'currentColor' : 'none'}
        strokeWidth={1.6}
      />
    </button>
  );
}
