import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link2, Copy, Mail, Check, Share2 } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';
import {
  buildNativeShareData,
  buildShareText,
  buildShareUrl,
  canUseNativeShare,
  invokeNativeShare,
} from '../lib/shareUrl';
import { motionDuration, prefersReducedMotion } from '../lib/motion';

interface ShareDropdownProps {
  agentId: string;
  agentName: string;
  /** Short teaser for social channels (X / WhatsApp / native share). */
  oneLiner: string;
  /**
   * Full take body for the public /share URL and “Copy take” text.
   * Falls back to `oneLiner` when omitted.
   */
  takeBody?: string;
  prompt: string;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

type MenuPlacement = {
  top: number;
  left: number;
  openUp: boolean;
};

export function ShareDropdown({
  agentId,
  agentName,
  oneLiner,
  takeBody,
  prompt,
  isOpen,
  onClose,
  anchorRef,
}: ShareDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copiedState, setCopiedState] = useState<'link' | 'text' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const reducedMotion = prefersReducedMotion();
  const labelId = useId();
  const errorId = useId();

  useEffect(() => {
    setNativeShareAvailable(canUseNativeShare());
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setPlacement(null);
      return;
    }

    const place = () => {
      const anchor = anchorRef.current;
      const menu = dropdownRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const menuWidth = menu?.offsetWidth || 220;
      const menuHeight = menu?.offsetHeight || 280;
      const gap = 8;
      const pad = 12;

      let left = rect.right - menuWidth;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuWidth - pad));

      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

      let top = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
      top = Math.max(pad, Math.min(top, window.innerHeight - menuHeight - pad));

      setPlacement({ top, left, openUp });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen, anchorRef, nativeShareAvailable, copyError, copiedState]);

  useEffect(() => {
    if (!isOpen) {
      setCopyError(null);
      setCopiedState(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        anchorRef.current?.focus();
        return;
      }

      if (!dropdownRef.current) return;
      const items = Array.from(
        dropdownRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      if (items.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const index = items.indexOf(active as HTMLElement);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = index < 0 ? 0 : (index + 1) % items.length;
        items[next]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (!copiedState) return;
    const hold = motionDuration(1500);
    if (hold <= 0) {
      setCopiedState(null);
      return;
    }
    const timer = window.setTimeout(() => setCopiedState(null), hold);
    return () => window.clearTimeout(timer);
  }, [copiedState]);

  if (!isOpen) return null;

  const fullTake = (takeBody || oneLiner || '').trim() || oneLiner;

  const shareUrl = buildShareUrl({
    agentId,
    prompt,
    response: fullTake,
  });

  const handleNativeShare = async () => {
    setCopyError(null);
    const data = buildNativeShareData({ agentName, oneLiner, shareUrl });
    const result = await invokeNativeShare(data);
    if (result === 'shared') {
      onClose();
      return;
    }
    if (result === 'cancelled') return;
    if (result === 'unavailable') {
      setCopyError('System share is not available here. Use Copy link instead.');
      return;
    }
    setCopyError('Could not open system share. Try Copy link instead.');
  };

  const handleCopyLink = async () => {
    setCopyError(null);
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopiedState('link');
    } else {
      setCopyError('Could not copy — select and copy the link manually.');
    }
  };

  const handleCopyText = async () => {
    const textContent = `${agentName} · Arena
─────────────────────
${fullTake}

${shareUrl}`;
    setCopyError(null);
    const ok = await copyToClipboard(textContent);
    if (ok) {
      setCopiedState('text');
    } else {
      setCopyError('Could not copy text. Try again or long-press to select.');
    }
  };

  const handleShareX = () => {
    const shareText = buildShareText({
      agentName,
      oneLiner,
      shareUrl,
      channel: 'x',
    });
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(xUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleShareWhatsApp = () => {
    const shareText = buildShareText({
      agentName,
      oneLiner,
      shareUrl,
      channel: 'whatsapp',
    });
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleShareEmail = () => {
    const emailBody = buildShareText({
      agentName,
      oneLiner,
      shareUrl,
      channel: 'email',
    });
    const mailtoUrl = `mailto:?subject=${encodeURIComponent('A take on Arena')}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    onClose();
  };

  const style: CSSProperties = placement
    ? {
        position: 'fixed',
        top: placement.top,
        left: placement.left,
      }
    : {
        position: 'fixed',
        // Off-screen first paint so layout can measure without a flash at 0,0
        top: -9999,
        left: -9999,
        visibility: 'hidden',
      };

  return (
    <div
      ref={dropdownRef}
      role="menu"
      aria-labelledby={labelId}
      aria-label="Share this take"
      className={[
        'share-menu',
        placement?.openUp ? 'share-menu--up' : 'share-menu--down',
        reducedMotion ? 'share-menu--static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <div id={labelId} className="share-menu__label">
        Share this take
      </div>

      <div className="share-menu__divider" aria-hidden />

      <div className="share-menu__body">
        {copyError ? (
          <p id={errorId} role="alert" className="share-menu__error">
            {copyError}
          </p>
        ) : null}

        {nativeShareAvailable ? (
          <ShareOption
            icon={<Share2 width={16} height={16} aria-hidden />}
            label="Share…"
            onClick={() => {
              void handleNativeShare();
            }}
            describedBy={copyError ? errorId : undefined}
          />
        ) : null}

        <ShareOption
          icon={
            copiedState === 'link' ? (
              <Check width={16} height={16} aria-hidden />
            ) : (
              <Link2 width={16} height={16} aria-hidden />
            )
          }
          label={copiedState === 'link' ? 'Copied!' : 'Copy link'}
          success={copiedState === 'link'}
          onClick={() => {
            void handleCopyLink();
          }}
          describedBy={copyError ? errorId : undefined}
        />

        <ShareOption
          icon={
            copiedState === 'text' ? (
              <Check width={16} height={16} aria-hidden />
            ) : (
              <Copy width={16} height={16} aria-hidden />
            )
          }
          label={copiedState === 'text' ? 'Copied!' : 'Copy as text'}
          success={copiedState === 'text'}
          onClick={() => {
            void handleCopyText();
          }}
          describedBy={copyError ? errorId : undefined}
        />

        <ShareOption
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          }
          label="Post on X"
          onClick={handleShareX}
        />

        <ShareOption
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          }
          label="Send on WhatsApp"
          onClick={handleShareWhatsApp}
        />

        <ShareOption
          icon={<Mail width={16} height={16} aria-hidden />}
          label="Share via email"
          onClick={handleShareEmail}
        />
      </div>
    </div>
  );
}

interface ShareOptionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  success?: boolean;
  describedBy?: string;
}

function ShareOption({ icon, label, onClick, success, describedBy }: ShareOptionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={['share-menu__item', success ? 'share-menu__item--success' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-describedby={describedBy}
    >
      <span className="share-menu__item-icon">{icon}</span>
      <span className="share-menu__item-label">{label}</span>
    </button>
  );
}
