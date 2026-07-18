import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff, X } from 'lucide-react';
import { motionDuration, prefersReducedMotion } from '../lib/motion';
import {
  NETWORK_RECONNECTED_HOLD_MS,
  networkBannerAriaLive,
  networkBannerKind,
  networkBannerMessage,
  networkBannerRole,
} from '../lib/networkStatus';

/**
 * Sticky banner when the browser reports offline (or reconnects briefly).
 * Pure client signal — does not claim server health (footer handles that).
 */
export function NetworkStatusBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reduceMotion = prefersReducedMotion();

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      clearReconnectTimer();
      const hold = motionDuration(NETWORK_RECONNECTED_HOLD_MS);
      if (hold <= 0) {
        setShowReconnected(false);
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        setShowReconnected(false);
        reconnectTimerRef.current = null;
      }, hold);
    };
    const onOffline = () => {
      clearReconnectTimer();
      setOnline(false);
      setShowReconnected(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearReconnectTimer();
    };
  }, []);

  const kind = networkBannerKind({ online, showReconnected });
  const message = networkBannerMessage(kind);
  const role = networkBannerRole(kind);
  const ariaLive = networkBannerAriaLive(kind);
  if (!message || !role || !ariaLive) return null;

  const offline = kind === 'offline';
  const holdMs = motionDuration(NETWORK_RECONNECTED_HOLD_MS);
  const showProgress = !offline && !reduceMotion && holdMs > 0;

  return (
    <div
      className={[
        'network-banner',
        offline ? 'network-banner--offline' : 'network-banner--online',
        reduceMotion ? 'network-banner--static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={role}
      aria-live={ariaLive}
    >
      <div className="network-banner__inner">
        <span className="network-banner__icon" aria-hidden>
          {offline ? <WifiOff width={15} height={15} strokeWidth={1.75} /> : <Wifi width={15} height={15} strokeWidth={1.75} />}
        </span>
        <span className="network-banner__message">{message}</span>
        {!offline ? (
          <button
            type="button"
            className="network-banner__dismiss"
            onClick={() => {
              clearReconnectTimer();
              setShowReconnected(false);
            }}
            aria-label="Dismiss back-online notice"
          >
            <X width={14} height={14} strokeWidth={2} aria-hidden />
            <span className="network-banner__dismiss-label">Dismiss</span>
          </button>
        ) : null}
      </div>
      {showProgress ? (
        <span
          className="network-banner__progress"
          style={{ animationDuration: `${holdMs}ms` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
