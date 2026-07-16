import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadMarkdownFile,
  downloadTextFile,
  sanitizeDownloadFilename,
} from './downloadTextFile';

describe('sanitizeDownloadFilename', () => {
  it('slugifies and truncates', () => {
    expect(sanitizeDownloadFilename('Should we ship today?')).toBe('should-we-ship-today');
    expect(sanitizeDownloadFilename('  ')).toBe('arena-export');
    expect(sanitizeDownloadFilename('A'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an object URL and clicks an anchor', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click,
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchor as unknown as HTMLAnchorElement;
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    const ok = downloadTextFile('# Hello', { filename: 'note.md', mimeType: 'text/markdown' });
    expect(ok).toBe(true);
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(anchor.download).toBe('note.md');
    expect(anchor.href).toBe('blob:mock');
  });

  it('returns false for empty content', () => {
    expect(downloadTextFile('', { filename: 'x.md' })).toBe(false);
  });

  it('downloadMarkdownFile adds .md extension from stem', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click,
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchor as unknown as HTMLAnchorElement;
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    expect(downloadMarkdownFile('body', 'My Prompt!')).toBe(true);
    expect(anchor.download).toBe('my-prompt.md');
    expect(click).toHaveBeenCalled();
  });
});
