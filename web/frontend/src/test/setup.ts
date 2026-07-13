import '@testing-library/jest-dom/vitest';

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
  // @ts-expect-error -- minimal stub for unit tests; integration tests should mock properly.
  globalThis.fetch = () => Promise.reject(new Error('fetch not mocked'));
}