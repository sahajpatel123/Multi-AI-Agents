import type { ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export type EmptyStateVariant = 'default' | 'error' | 'card' | 'filter';

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Decorative icon or illustration (hidden from AT by default wrapper). */
  icon?: ReactNode;
  /** Primary / secondary action buttons. */
  actions?: ReactNode;
  variant?: EmptyStateVariant;
  /** When true, use role=alert (errors). Default status for empty/filter. */
  alert?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * Shared empty / error / filter-zero chrome for production lists & gates.
 * Composes with existing `.arena-btn` actions — does not invent a second button system.
 */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  variant = 'default',
  alert = false,
  className = '',
  children,
}: EmptyStateProps) {
  const reduceMotion = prefersReducedMotion();
  const classes = [
    'arena-empty-state',
    `arena-empty-state--${variant}`,
    reduceMotion ? 'arena-empty-state--static' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      role={alert || variant === 'error' ? 'alert' : 'status'}
      aria-live={alert || variant === 'error' ? 'assertive' : 'polite'}
    >
      {icon ? (
        <div className="arena-empty-state__icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h2 className="arena-empty-state__title">{title}</h2>
      {description ? (
        <p className="arena-empty-state__description">{description}</p>
      ) : null}
      {children}
      {actions ? <div className="arena-empty-state__actions">{actions}</div> : null}
    </div>
  );
}

export default EmptyState;
