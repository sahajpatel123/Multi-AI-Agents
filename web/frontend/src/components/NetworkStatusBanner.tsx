import { useEffect, useRef, useState } from 'react';
import { motionDuration } from '../lib/motion';
import {
  NETWORK_RECONNECTED_HOLD_MS,
  networkBannerKind,
  networkBannerMessage,
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
  if (!message) return null;

  const offline = kind === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: `max(10px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px))`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textAlign: 'center',
        fontSize: 13,
        fontFamily: 'Georgia, Times New Roman, serif',
        color: offline ? '#5C2B0E' : '#2C4A36',
        background: offline ? 'rgba(253, 246, 236, 0.98)' : 'rgba(232, 245, 233, 0.98)',
        borderBottom: offline
          ? '0.5px solid rgba(196, 149, 106, 0.45)'
          : '0.5px solid rgba(138, 168, 153, 0.45)',
        boxShadow: '0 4px 16px rgba(44, 24, 16, 0.06)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>{message}</span>
      {!offline ? (
        <button
          type="button"
          onClick={() => {
            clearReconnectTimer();
            setShowReconnected(false);
          }}
          aria-label="Dismiss back-online notice"
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: '0.5px solid rgba(44, 74, 54, 0.25)',
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 12,
            color: '#2C4A36',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
