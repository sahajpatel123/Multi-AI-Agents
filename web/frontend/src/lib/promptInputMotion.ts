/** Motion decisions for the Arena PromptInput chrome (pure). */

export function promptBorderAnimation(isFocused: boolean, reducedMotion: boolean): string {
  if (reducedMotion || !isFocused) return 'none';
  return 'borderFlow 4s ease infinite';
}

/**
 * Waveform bars next to the prompt: loading pulse, calm focus pulse, or static.
 */
export function promptDotWaveAnimation(
  isLoading: boolean,
  isFocused: boolean,
  reducedMotion: boolean,
): string {
  if (reducedMotion) return 'none';
  if (isLoading) return 'dotWave 1.2s ease-in-out infinite';
  if (isFocused) return 'dotWave 2.4s ease-in-out infinite';
  return 'none';
}

/** Soft glow pulse on the send control when ready to submit. */
export function promptSendOrbAnimation(canSubmit: boolean, reducedMotion: boolean): string {
  if (reducedMotion || !canSubmit) return 'none';
  return 'orbPulse 2.4s ease-in-out infinite';
}

/** Spinner on the send control while a stream is in flight. */
export function promptSendSpinnerAnimation(isLoading: boolean, reducedMotion: boolean): string {
  if (reducedMotion || !isLoading) return 'none';
  return 'spin 1s linear infinite';
}
