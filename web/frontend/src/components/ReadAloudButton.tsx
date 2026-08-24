import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export function readableSpeechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~>#|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.speechSynthesis?.speak !== 'function') return null;
  if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

let activeStop: (() => void) | null = null;

interface ReadAloudButtonProps {
  text: string;
  label?: string;
  onStart?: () => void;
}

/** A small, browser-native audio affordance for response cards. */
export function ReadAloudButton({
  text,
  label = 'Read this take aloud',
  onStart,
}: ReadAloudButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechText = readableSpeechText(text);
  const speechSupported = getSpeechSynthesis() !== null;

  const stop = useCallback(() => {
    const synthesis = getSpeechSynthesis();
    if (utteranceRef.current && synthesis) synthesis.cancel();
    utteranceRef.current = null;
    if (activeStop === stop) activeStop = null;
    setIsSpeaking(false);
  }, []);

  // Do not let a response that was replaced keep speaking the old answer.
  useEffect(() => {
    return () => {
      if (utteranceRef.current) stop();
    };
  }, [speechText, stop]);

  const toggle = () => {
    const synthesis = getSpeechSynthesis();
    if (!synthesis || !speechText) return;
    if (isSpeaking) {
      stop();
      return;
    }

    // Speech is global in the browser, so starting here must stop another
    // card's narration rather than letting two answers overlap.
    activeStop?.();
    synthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(speechText);
    utteranceRef.current = utterance;
    activeStop = stop;
    const finish = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      if (activeStop === stop) activeStop = null;
      setIsSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    setIsSpeaking(true);
    onStart?.();
    synthesis.speak(utterance);
  };

  const buttonLabel = isSpeaking ? `Stop reading ${label.replace(/^Read /, '')}` : label;
  const disabled = !speechSupported || !speechText;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      aria-label={buttonLabel}
      aria-pressed={isSpeaking}
      disabled={disabled}
      title={
        !speechSupported
          ? 'Speech playback is unavailable in this browser'
          : disabled
            ? 'There is no response to read yet'
            : buttonLabel
      }
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: isSpeaking ? '#F0EBE3' : 'transparent',
        color: isSpeaking ? '#F0B84E' : disabled ? '#D1C7BE' : '#A0A39A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {isSpeaking ? <VolumeX width={15} height={15} aria-hidden /> : <Volume2 width={15} height={15} aria-hidden />}
    </button>
  );
}
