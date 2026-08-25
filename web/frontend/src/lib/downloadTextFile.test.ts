import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadApaFile,
  downloadBibtexFile,
  downloadChicagoFile,
  downloadCsvFile,
  downloadCslJsonFile,
  downloadJsonFile,
  downloadMarkdownFile,
  downloadRisFile,
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

  it('downloadJsonFile adds .json extension and date by default', () => {
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
    expect(downloadJsonFile('{"ok":true}', 'Selected Memories!', { date: d })).toBe(true);
    expect(anchor.download).toBe('selected-memories-2026-07-16.json');
    expect(click).toHaveBeenCalled();
  });

  it('downloadCsvFile adds .csv extension and spreadsheet MIME type', () => {
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
    expect(
      downloadCsvFile('source_number,source\n1,https://example.com', 'Public Sources', { date: d }),
    ).toBe(true);
    expect(anchor.download).toBe('public-sources-2026-07-16.csv');
    expect(click).toHaveBeenCalled();
  });

  it('downloadBibtexFile adds .bib extension and citation MIME type', () => {
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
    expect(downloadBibtexFile('@online{arena_report}', 'Agent Citation', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-2026-07-16.bib');
    expect(click).toHaveBeenCalled();
  });

  it('downloadRisFile adds .ris extension and citation MIME type', () => {
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
    expect(downloadRisFile('TY  - ELEC\nER  -\n', 'Agent Citation', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-2026-07-16.ris');
    expect(click).toHaveBeenCalled();
  });

  it('downloadApaFile adds .txt extension and keeps the citation MIME type', () => {
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
    expect(downloadApaFile('Arena APA citation', 'Agent Citation APA', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-apa-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadChicagoFile adds a dated .txt citation filename', () => {
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
    expect(downloadChicagoFile('Arena Chicago citation', 'Agent Citation Chicago', { date: d })).toBe(
      true,
    );
    expect(anchor.download).toBe('agent-citation-chicago-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadCslJsonFile adds .csl.json extension and citation MIME type', () => {
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
    expect(
      downloadCslJsonFile('[{"title":"Agent report"}]', 'Agent Citation', { date: d }),
    ).toBe(true);
    expect(anchor.download).toBe('agent-citation-2026-07-16.csl.json');
    expect(click).toHaveBeenCalled();
  });
});
