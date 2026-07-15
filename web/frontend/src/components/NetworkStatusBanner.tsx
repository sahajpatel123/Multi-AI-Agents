import { useEffect, useState } from 'react';
import { motionDuration } from '../lib/motion';

/**
 * Sticky banner when the browser reports offline (or reconnects briefly).
 * Pure client signal — does not claim server health (footer handles that).
 */
export function NetworkStatusBanner() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      const hold = motionDuration(2800);
      window.setTimeout(() => setShowReconnected(false), hold > 0 ? hold : 0);
    };
    const onOffline = () => {
      setOnline(false);
      setShowReconnected(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online && !showReconnected) return null;

  const offline = !online;

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
        padding: '10px 16px',
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
      {offline
        ? 'You are offline — new prompts and streams will wait until the connection returns.'
        : 'Back online — you can continue.'}
    </div>
  );
}
