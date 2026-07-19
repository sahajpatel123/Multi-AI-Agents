import '@testing-library/jest-dom/vitest';

// Polyfill localStorage/sessionStorage for jsdom (may be unavailable on newer Node)
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store: Record<string, string> = {};
  const storageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true });
}

if (typeof globalThis.sessionStorage === 'undefined' || typeof globalThis.sessionStorage.clear !== 'function') {
  const store: Record<string, string> = {};
  const storageMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: storageMock, writable: true });
}

// jsdom doesn't implement matchMedia; some components use it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Polyfill fetch + Response if not already in jsdom.
if (typeof globalThis.fetch === 'undefined') {
  // minimal stub for unit tests; integration tests should mock properly.
  globalThis.fetch = (() => Promise.reject(new Error('fetch not mocked'))) as typeof fetch;
}

// jsdom doesn't implement IntersectionObserver; pages use it for reveal-on-scroll
// (PricingPage, HomePage, PersonasPage). Provide a no-op stub that satisfies the
// constructor signature so useEffect blocks don't throw ReferenceError.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = '0px';
    readonly thresholds: ReadonlyArray<number> = [0];
    private readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      // Immediately fire once with isIntersecting=false so entrance animations
      // stay at their initial state rather than animating on mount.
      this.callback(
        [{ isIntersecting: false, intersectionRatio: 0, target } as IntersectionObserverEntry],
        this,
      );
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}