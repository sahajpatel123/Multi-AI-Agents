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