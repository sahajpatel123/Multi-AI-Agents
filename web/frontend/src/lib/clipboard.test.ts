import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyCsvToClipboard,
  copyJsonToClipboard,
  copyMarkdownToClipboard,
  copyToClipboard,
} from './clipboard';
import { expectBlob } from '../test/blob';

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

  it('removes the fallback textarea even when execCommand throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('copy blocked');
      }),
    });

    await expect(copyToClipboard('still needs a copy')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('restores focus after the fallback copy succeeds', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(true),
    });

    await expect(copyToClipboard('focus me')).resolves.toBe(true);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('writes CSV clipboard data through ClipboardItem when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        data: Record<string, Blob>;

        constructor(data: Record<string, Blob>) {
          this.data = data;
        }
      },
    );

    expect(await copyCsvToClipboard('\uFEFFa,b\r\n1,2\r\n')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { data: Record<string, Blob> };
    expectBlob(item.data['text/csv']);
    expectBlob(item.data['text/plain']);
  });

  it('falls back to plain text when ClipboardItem is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyCsvToClipboard('a,b\r\n1,2\r\n')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('a,b\r\n1,2\r\n');
  });

  it('writes Markdown clipboard data through ClipboardItem when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        data: Record<string, Blob>;

        constructor(data: Record<string, Blob>) {
          this.data = data;
        }
      },
    );

    expect(await copyMarkdownToClipboard('# Arena usage\n')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { data: Record<string, Blob> };
    expectBlob(item.data['text/markdown']);
    expectBlob(item.data['text/plain']);
  });

  it('falls back to plain text when Markdown clipboard support is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyMarkdownToClipboard('# Arena usage\n')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('# Arena usage\n');
  });

  it('writes JSON clipboard data through ClipboardItem when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        data: Record<string, Blob>;

        constructor(data: Record<string, Blob>) {
          this.data = data;
        }
      },
    );

    expect(await copyJsonToClipboard('{"rows":[]}')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { data: Record<string, Blob> };
    expectBlob(item.data['application/json']);
    expectBlob(item.data['text/plain']);
  });

  it('falls back to plain text when JSON clipboard support is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyJsonToClipboard('{"rows":[]}')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('{"rows":[]}');
  });
});
