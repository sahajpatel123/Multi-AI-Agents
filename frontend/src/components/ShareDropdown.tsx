import { useEffect, useRef, useState } from 'react';
import { Link2, Copy, Mail, Check } from 'lucide-react';

interface ShareDropdownProps {
  agentId: string;
  agentName: string;
  oneLiner: string;
  prompt: string;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

export function ShareDropdown({
  agentId,
  agentName,
  oneLiner,
  prompt,
  isOpen,
  onClose,
  anchorRef,
}: ShareDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copiedState, setCopiedState] = useState<'link' | 'text' | null>(null);

  useEffect(() => {
    if (!isOpen) return;

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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (copiedState) {
      const timer = setTimeout(() => setCopiedState(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [copiedState]);

  if (!isOpen) return null;

  const currentUrl = window.location.href;
  const domain = window.location.origin;

  const handleCopyLink = async () => {
    const shareUrl = `${domain}/share?agent=${encodeURIComponent(agentId)}&prompt=${encodeURIComponent(prompt)}&response=${encodeURIComponent(oneLiner)}`;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedState('link');
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleCopyText = async () => {
    const textContent = `${agentName} · Arena
─────────────────────
"${oneLiner}"

arena.app`;
    
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedState('text');
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleShareX = () => {
    const shareText = `"${oneLiner}"
— ${agentName} on Arena

${currentUrl}

#Arena #AI`;
    
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(xUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleShareWhatsApp = () => {
    const shareText = `Check out this take on Arena:

"${oneLiner}"
— ${agentName}

${currentUrl}`;
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const handleShareEmail = () => {
    const emailBody = `I found this on Arena:

${agentName} says:
"${oneLiner}"

Check it out: ${currentUrl}`;
    
    const mailtoUrl = `mailto:?subject=${encodeURIComponent('A take on Arena')}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    onClose();
  };

  const getDropdownPosition = () => {
    if (!anchorRef.current) return {};
    
    const rect = anchorRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      top: `${rect.bottom + 8}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        ...getDropdownPosition(),
        background: '#FFFFFF',
        border: '1px solid #E0D8D0',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(26,23,20,0.10)',
        padding: '6px',
        minWidth: '200px',
        zIndex: 1000,
        animation: 'shareDropdownEnter 200ms ease',
      }}
    >
      <style>
        {`
          @keyframes shareDropdownEnter {
            from {
              opacity: 0;
              transform: translateY(-6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>

      <div
        style={{
          fontSize: '11px',
          color: '#6B6460',
          padding: '6px 10px 4px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Share this take
      </div>

      <div
        style={{
          height: '1px',
          background: '#E0D8D0',
          margin: '0 6px',
        }}
      />

      <div style={{ marginTop: '2px' }}>
        <ShareOption
          icon={copiedState === 'link' ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
          label={copiedState === 'link' ? 'Copied!' : 'Copy link'}
          onClick={handleCopyLink}
        />

        <ShareOption
          icon={copiedState === 'text' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          label={copiedState === 'text' ? 'Copied!' : 'Copy as text'}
          onClick={handleCopyText}
        />

        <ShareOption
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          }
          label="Post on X"
          onClick={handleShareX}
        />

        <ShareOption
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          }
          label="Send on WhatsApp"
          onClick={handleShareWhatsApp}
        />

        <ShareOption
          icon={<Mail className="w-4 h-4" />}
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
}

function ShareOption({ icon, label, onClick }: ShareOptionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 12px',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#1A1714',
        cursor: 'pointer',
        transition: 'background 150ms ease',
        background: isHovered ? '#F0EBE3' : 'transparent',
        border: 'none',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
