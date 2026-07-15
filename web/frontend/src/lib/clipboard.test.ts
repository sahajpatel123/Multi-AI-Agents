import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false for empty text', async () => {
    expect(await copyToClipboard('')).toBe(false);
  });

  it('uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyToClipboard('hello arena')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello arena');
  });

  it('falls back to execCommand when clipboard API throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    // jsdom may not define execCommand — install a spyable stub first.
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });
    expect(await copyToClipboard('fallback text')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});
