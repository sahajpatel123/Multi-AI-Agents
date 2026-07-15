/**
 * Canonical primary product surfaces for Arena web.
 * Used for flow audits and to keep nav destinations honest.
 */

export type PrimaryFlow = {
  id: string;
  path: string;
  requiresAuth: boolean;
  purpose: string;
};

export const PRIMARY_FLOWS: readonly PrimaryFlow[] = [
  {
    id: 'home',
    path: '/',
    requiresAuth: false,
    purpose: 'Marketing entry and Try Arena CTA',
  },
  {
    id: 'signin',
    path: '/signin',
    requiresAuth: false,
    purpose: 'Authentication',
  },
  {
    id: 'arena',
    path: '/app',
    requiresAuth: true,
    purpose: 'Four-mind panel prompt stream',
  },
  {
    id: 'agent',
    path: '/agent',
    requiresAuth: true,
    purpose: 'Long-form research + Condura on-device handoff',
  },
  {
    id: 'watchlist',
    path: '/agent/watchlist',
    requiresAuth: true,
    purpose: 'Recurring research schedule',
  },
  {
    id: 'personas',
    path: '/personas',
    requiresAuth: false,
    purpose: 'Build the four-slot panel',
  },
  {
    id: 'pricing',
    path: '/pricing',
    requiresAuth: false,
    purpose: 'Tier comparison and upgrade',
  },
  {
    id: 'product',
    path: '/product',
    requiresAuth: false,
    purpose: 'Product story including Condura honesty',
  },
  {
    id: 'share',
    path: '/share',
    requiresAuth: false,
    purpose: 'Public shared take landing from Arena copy-link',
  },
] as const;

export function primaryPaths(): string[] {
  return PRIMARY_FLOWS.map((f) => f.path);
}

export function findPrimaryFlow(path: string): PrimaryFlow | undefined {
  const normalized = path.split('?')[0].replace(/\/$/, '') || '/';
  return PRIMARY_FLOWS.find((f) => f.path === normalized);
}
