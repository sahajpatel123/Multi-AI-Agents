import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const SPEECH_CHUNK_LENGTH = 240;

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

/**
 * Keep long reports reliable across browsers that truncate very long native
 * speech utterances. Prefer a sentence boundary, then a word boundary, and
 * only split inside a word as a last resort.
 */
function splitSpeechText(text: string, maxLength = SPEECH_CHUNK_LENGTH): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const limit = Number.isFinite(maxLength)
    ? Math.max(1, Math.floor(maxLength))
    : SPEECH_CHUNK_LENGTH;
  const chunks: string[] = [];
  let remaining = normalized;
  const preferredBreakFloor = Math.floor(limit * 0.55);

  while (remaining.length > limit) {
    const sentenceBreak = Math.max(
      remaining.lastIndexOf('. ', limit - 1),
      remaining.lastIndexOf('! ', limit - 1),
      remaining.lastIndexOf('? ', limit - 1),
      remaining.lastIndexOf('; ', limit - 1),
      remaining.lastIndexOf(': ', limit - 1),
    );
    const sentenceCut = sentenceBreak >= preferredBreakFloor ? sentenceBreak + 1 : -1;
    const wordCut = remaining.lastIndexOf(' ', limit);
    const cut = sentenceCut > 0 ? sentenceCut : wordCut > 0 ? wordCut : limit;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.speechSynthesis?.speak !== 'function') return null;
  if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

function cancelSpeech(synthesis: SpeechSynthesis | null): void {
  if (!synthesis) return;
  try {
    synthesis.cancel();
  } catch {
    // Browser speech implementations can throw while the document is closing.
    // Cleanup should still release this control's local state.
  }
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
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const speechRunRef = useRef(0);
  const speechText = readableSpeechText(text);
  const speechChunks = splitSpeechText(speechText);
  const speechSupported = getSpeechSynthesis() !== null;

  const stop = useCallback(() => {
    speechRunRef.current += 1;
    const synthesis = synthesisRef.current ?? getSpeechSynthesis();
    if (utteranceRef.current) cancelSpeech(synthesis);
    utteranceRef.current = null;
    synthesisRef.current = null;
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
    if (!synthesis || speechChunks.length === 0) return;
    if (isSpeaking) {
      stop();
      return;
    }

    // Speech is global in the browser, so starting here must stop another
    // card's narration rather than letting two answers overlap.
    activeStop?.();
    cancelSpeech(synthesis);

    const speechRun = speechRunRef.current + 1;
    speechRunRef.current = speechRun;
    synthesisRef.current = synthesis;
    activeStop = stop;
    const finish = () => {
      if (speechRunRef.current !== speechRun) return;
      utteranceRef.current = null;
      synthesisRef.current = null;
      if (activeStop === stop) activeStop = null;
      setIsSpeaking(false);
    };

    const speakChunk = (chunkIndex: number) => {
      if (speechRunRef.current !== speechRun) return;
      const chunk = speechChunks[chunkIndex];
      if (!chunk) {
        finish();
        return;
      }

      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = new window.SpeechSynthesisUtterance(chunk);
      } catch {
        finish();
        return;
      }

      utteranceRef.current = utterance;
      const finishChunk = () => {
        if (speechRunRef.current !== speechRun || utteranceRef.current !== utterance) return;
        if (chunkIndex + 1 < speechChunks.length) {
          speakChunk(chunkIndex + 1);
        } else {
          finish();
        }
      };
      utterance.onend = finishChunk;
      utterance.onerror = () => {
        if (speechRunRef.current !== speechRun || utteranceRef.current !== utterance) return;
        finish();
      };
      try {
        synthesis.speak(utterance);
      } catch {
        cancelSpeech(synthesis);
        finish();
      }
    };

    setIsSpeaking(true);
    try {
      onStart?.();
    } catch {
      // Analytics must never prevent the response from being read aloud.
    }
    speakChunk(0);
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
