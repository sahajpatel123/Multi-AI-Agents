import type { ReactNode } from 'react';

type IconFn = (size?: number, extra?: boolean) => ReactNode;

function strokeProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export const Icons = {
  arrowRight: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )) as IconFn,

  plus: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )) as IconFn,

  copy: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )) as IconFn,

  download: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )) as IconFn,

  refresh: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  )) as IconFn,

  bell: ((size = 16, filled = false) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )) as (size?: number, filled?: boolean) => ReactNode,

  users: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )) as IconFn,

  lightning: ((size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
    </svg>
  )) as IconFn,

  star: ((size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )) as IconFn,

  logout: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )) as IconFn,

  plug: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <path d="M18.36 6.64a9 9 0 11-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )) as IconFn,

  grid: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )) as IconFn,

  layers: ((size = 16) => (
    <svg {...strokeProps(size)} aria-hidden>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )) as IconFn,

  /** Sparkle / star burst for CTAs */
  sparkle: ((size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  )) as IconFn,

  /** Flame — stress test / Arena */
  flame: ((size = 16) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        d="M12 2c0 4-4 6-4 10 0 3 2 6 4 8 2-2 4-5 4-8 0-4-4-6-4-10z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 18c-1.5-1-2-2.5-2-4" strokeLinecap="round" />
    </svg>
  )) as IconFn,
};

export function ButtonSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="arena-btn-spinner"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2} strokeDasharray="28 40" strokeLinecap="round" />
    </svg>
  );
}
