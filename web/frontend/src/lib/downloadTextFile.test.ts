import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadMarkdownFile,
  downloadTextFile,
  formatDownloadDateSuffix,
  sanitizeDownloadFilename,
  withDownloadDate,
} from './downloadTextFile';

describe('sanitizeDownloadFilename', () => {
  it('slugifies and truncates', () => {
    expect(sanitizeDownloadFilename('Should we ship today?')).toBe('should-we-ship-today');
    expect(sanitizeDownloadFilename('  ')).toBe('arena-export');
    expect(sanitizeDownloadFilename('A'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('withDownloadDate', () => {
  it('appends yyyy-mm-dd and respects max length', () => {
    const d = new Date(2026, 6, 16); // local July 16, 2026
    expect(formatDownloadDateSuffix(d)).toBe('2026-07-16');
    expect(withDownloadDate('My Prompt!', d)).toBe('my-prompt-2026-07-16');
    expect(withDownloadDate('A'.repeat(200), d).length).toBeLessThanOrEqual(80);
    expect(withDownloadDate('A'.repeat(200), d).endsWith('-2026-07-16')).toBe(true);
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

  it('downloadMarkdownFile adds .md extension and date by default', () => {
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

    const d = new Date(2026, 6, 16);
    expect(downloadMarkdownFile('body', 'My Prompt!', { date: d })).toBe(true);
    expect(anchor.download).toBe('my-prompt-2026-07-16.md');
    expect(click).toHaveBeenCalled();
  });

  it('downloadMarkdownFile can skip dating', () => {
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

    expect(downloadMarkdownFile('body', 'My Prompt!', { dated: false })).toBe(true);
    expect(anchor.download).toBe('my-prompt.md');
  });
});
