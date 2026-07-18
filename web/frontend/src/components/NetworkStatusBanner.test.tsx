import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { NetworkStatusBanner } from './NetworkStatusBanner';

/**
 * The banner reads `navigator.onLine` once at mount, then subscribes
 * to the `online` / `offline` events. Each test sets up its own
 * navigator state and event dispatch.
 */

let onlineRef = { value: true };

function installNavigator(online: boolean) {
  onlineRef.value = online;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => onlineRef.value,
  });
}

function fireOnline() {
  onlineRef.value = true;
  window.dispatchEvent(new Event('online'));
}
function fireOffline() {
  onlineRef.value = false;
  window.dispatchEvent(new Event('offline'));
}

beforeEach(() => {
  // matchMedia for motionDuration() — set to no-reduce so the
  // dismiss timer uses the full 2800ms hold.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
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
  installNavigator(true);
});

afterEach(() => {
  vi.useRealTimers();
  installNavigator(true);
});

describe('NetworkStatusBanner', () => {
  it('renders nothing when online and not in reconnected state', () => {
    installNavigator(true);
    const { container } = render(<NetworkStatusBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the offline message when navigator.onLine is false at mount', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    expect(container.textContent).toMatch(/You are offline/);
  });

  it('offline banner uses role=alert and aria-live=assertive', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    const banner = container.querySelector('[role="alert"]');
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute('aria-live', 'assertive');
  });

  it('flips to the reconnected banner when the online event fires', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    expect(container.textContent).toMatch(/You are offline/);

    act(() => {
      fireOnline();
    });

    // After 'online', the banner shows the reconnected state.
    expect(container.textContent).toMatch(/Back online/);
    const banner = container.querySelector('[role="status"]');
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('returns to the offline banner when offline fires after online', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    act(() => {
      fireOnline();
    });
    expect(container.textContent).toMatch(/Back online/);

    act(() => {
      fireOffline();
    });
    expect(container.textContent).toMatch(/You are offline/);
  });

  it('dismiss button removes the reconnected banner', () => {
    installNavigator(false);
    const { container, getByLabelText } = render(<NetworkStatusBanner />);
    act(() => {
      fireOnline();
    });
    expect(container.textContent).toMatch(/Back online/);

    act(() => {
      fireEvent.click(getByLabelText(/dismiss back-online notice/i));
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('applies offline chrome classes when offline', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    const banner = container.querySelector('.network-banner');
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass('network-banner--offline');
    expect(banner?.querySelector('.network-banner__icon')).not.toBeNull();
  });

  it('shows online chrome and progress rail when reconnected', () => {
    installNavigator(false);
    const { container } = render(<NetworkStatusBanner />);
    act(() => {
      fireOnline();
    });
    const banner = container.querySelector('.network-banner');
    expect(banner).toHaveClass('network-banner--online');
    expect(banner?.querySelector('.network-banner__progress')).not.toBeNull();
  });
});
