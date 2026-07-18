import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  collapsiblePromptAriaLabel,
  collapsiblePromptHint,
  isCollapsiblePrompt,
} from '../lib/collapsiblePrompt';
import { prefersReducedMotion } from '../lib/motion';

type CollapsiblePromptProps = {
  text: string;
};

export function CollapsiblePrompt({ text }: CollapsiblePromptProps) {
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();
  const isLong = isCollapsiblePrompt(text);
  const reducedMotion = prefersReducedMotion();
  const bodyId = useId();

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  const shellClass = [
    'collapsible-prompt',
    isMobile ? 'collapsible-prompt--mobile' : '',
    isLong ? 'collapsible-prompt--collapsible' : '',
    isLong && expanded ? 'collapsible-prompt--expanded' : '',
    isLong && !expanded ? 'collapsible-prompt--collapsed' : '',
    reducedMotion ? 'collapsible-prompt--static' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!isLong) {
    return (
      <div className={shellClass}>
        <p className="collapsible-prompt__text">{text}</p>
      </div>
    );
  }

  const toggle = () => setExpanded((v) => !v);

  return (
    <div className={shellClass}>
      <button
        type="button"
        className="collapsible-prompt__toggle"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={collapsiblePromptAriaLabel(expanded)}
      >
        <div id={bodyId} className="collapsible-prompt__clip">
          <p className="collapsible-prompt__text">{text}</p>
          {!expanded ? <span className="collapsible-prompt__fade" aria-hidden /> : null}
        </div>
        <span className="collapsible-prompt__hint">
          <span className="collapsible-prompt__hint-label">
            {collapsiblePromptHint(expanded)}
          </span>
          <ChevronDown
            className="collapsible-prompt__chevron"
            width={14}
            height={14}
            strokeWidth={1.75}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
}
