/**
 * OnboardingTour — localStorage-backed flag tracking whether the
 * user has completed (or skipped) the hub onboarding walkthrough.
 * Mirrors the recentTools / pinnedTools pattern: versioned
 * schema, safe JSON parse, silent on quota failure.
 *
 * The tour is opt-out: once dismissed it stays dismissed. We don't
 * re-show it after the user opts in to the playground so the
 * experience doesn't regress to first-run nag screens.
 */

const STORAGE_KEY = 'arena:persona-playground:onboarding-tour:v1';
const SCHEMA_VERSION = 1;

/**
 * Notify same-tab listeners that the tour state changed. The
 * browser `StorageEvent` only fires in OTHER tabs, so without
 * this signal the OnboardingTour widget mounted in the same tab
 * would not refresh until the next page load. Swallows any
 * dispatch failure (jsdom quirks, locked-down iframes).
 */
function notifySameTab(): void {
  if (typeof window === 'undefined') return;
  try {
    const event = new StorageEvent('storage', {
      key: STORAGE_KEY,
      newValue: window.localStorage.getItem(STORAGE_KEY),
    });
    window.dispatchEvent(event);
  } catch {
    /* silent */
  }
}

export interface OnboardingTourState {
  /** Schema version, for future migrations. */
  readonly v: typeof SCHEMA_VERSION;
  /** True once the user dismissed (completed or skipped) the tour. */
  readonly dismissed: boolean;
}

function defaultState(): OnboardingTourState {
  return { v: SCHEMA_VERSION, dismissed: false };
}

export function readOnboardingTour(
  storage: Pick<Storage, 'getItem'> | null,
): OnboardingTourState {
  if (!storage) return defaultState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultState();
    const o = parsed as { v?: unknown; dismissed?: unknown };
    if (o.v !== SCHEMA_VERSION) return defaultState();
    if (typeof o.dismissed !== 'boolean') return defaultState();
    return { v: SCHEMA_VERSION, dismissed: o.dismissed };
  } catch {
    return defaultState();
  }
}

export function writeOnboardingTour(
  storage: Pick<Storage, 'setItem'> | null,
  state: OnboardingTourState,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* silent */
    return;
  }
  notifySameTab();
}

export function dismissOnboardingTour(
  storage: Pick<Storage, 'setItem'> | null,
): void {
  writeOnboardingTour(storage, { v: SCHEMA_VERSION, dismissed: true });
}

export function resetOnboardingTour(
  storage: Pick<Storage, 'removeItem'> | null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent */
    return;
  }
  notifySameTab();
}

export const ONBOARDING_TOUR_KEY = STORAGE_KEY;
