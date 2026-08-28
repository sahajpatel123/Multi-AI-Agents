import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyCsvToClipboard,
  copyHtmlToClipboard,
  copyJsonToClipboard,
  copyJsonlToClipboard,
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

  it('falls back to plain text when a structured CSV write is rejected', async () => {
    const write = vi.fn().mockRejectedValue(new Error('CSV MIME type denied'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: Record<string, Blob>) {}
      },
    );

    const csv = 'a,b\r\n1,2\r\n';
    expect(await copyCsvToClipboard(csv)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(csv);
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

  it('falls back to plain text when a structured Markdown write is rejected', async () => {
    const write = vi.fn().mockRejectedValue(new Error('Markdown MIME type denied'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: Record<string, Blob>) {}
      },
    );

    const markdown = '# Arena usage\n';
    expect(await copyMarkdownToClipboard(markdown)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(markdown);
  });

  it('treats a non-callable structured Markdown writer as unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write: {}, writeText } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: Record<string, Blob>) {}
      },
    );

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

  it('writes JSONL clipboard data through ClipboardItem when available', async () => {
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

    expect(await copyJsonlToClipboard('{"task_id":"task_1"}\n')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { data: Record<string, Blob> };
    expectBlob(item.data['application/x-ndjson']);
    expectBlob(item.data['text/plain']);
  });

  it('falls back to plain text when JSONL clipboard support is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyJsonlToClipboard('{"task_id":"task_1"}\n')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('{"task_id":"task_1"}\n');
  });

  it('falls back to plain text when a structured JSONL write is rejected', async () => {
    const write = vi.fn().mockRejectedValue(new Error('NDJSON MIME type denied'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write, writeText } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: Record<string, Blob>) {}
      },
    );

    const jsonl = '{"task_id":"task_1"}\n';
    expect(await copyJsonlToClipboard(jsonl)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(jsonl);
  });

  it('treats a non-callable structured write as unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { write: {}, writeText } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public data: Record<string, Blob>) {}
      },
    );

    const jsonl = '{"task_id":"task_1"}\n';
    expect(await copyJsonlToClipboard(jsonl)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(jsonl);
  });

  it('writes rich HTML and a plain-text fallback through ClipboardItem', async () => {
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

    expect(await copyHtmlToClipboard('<strong>Arena</strong>', 'Arena')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0][0][0] as { data: Record<string, Blob> };
    expectBlob(item.data['text/html']);
    expectBlob(item.data['text/plain']);
  });

  it('falls back to the readable text when rich HTML clipboard support is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyHtmlToClipboard('<strong>Arena</strong>', 'Arena')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Arena');
  });
});
