import { describe, expect, it } from 'vitest';
import {
  promptBorderAnimation,
  promptDotWaveAnimation,
  promptSendOrbAnimation,
  promptSendSpinnerAnimation,
} from './promptInputMotion';

describe('promptInputMotion', () => {
  it('disables border flow under reduced motion', () => {
    expect(promptBorderAnimation(true, true)).toBe('none');
    expect(promptBorderAnimation(true, false)).toContain('borderFlow');
    expect(promptBorderAnimation(false, false)).toBe('none');
  });

  it('disables waveform under reduced motion', () => {
    expect(promptDotWaveAnimation(true, true, true)).toBe('none');
    expect(promptDotWaveAnimation(true, false, false)).toContain('1.2s');
    expect(promptDotWaveAnimation(false, true, false)).toContain('2.4s');
    expect(promptDotWaveAnimation(false, false, false)).toBe('none');
  });

  it('disables send orb and spinner under reduced motion', () => {
    expect(promptSendOrbAnimation(true, true)).toBe('none');
    expect(promptSendOrbAnimation(true, false)).toContain('orbPulse');
    expect(promptSendOrbAnimation(false, false)).toBe('none');
    expect(promptSendSpinnerAnimation(true, true)).toBe('none');
    expect(promptSendSpinnerAnimation(true, false)).toContain('spin');
  });
});
