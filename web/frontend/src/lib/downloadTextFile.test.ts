import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadAmaFile,
  downloadApaFile,
  downloadBibtexFile,
  downloadChicagoFile,
  downloadCsvFile,
  downloadCitationBundleFile,
  downloadCslJsonFile,
  downloadHarvardFile,
  downloadJsonFile,
  downloadIeeeFile,
  downloadMlaFile,
  downloadMarkdownFile,
  downloadRisFile,
  downloadReferenceBundleFile,
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

  it('revokes the object URL and removes the anchor when clicking fails', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click: vi.fn(() => {
        throw new Error('blocked download');
      }),
    };
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchor as unknown as HTMLAnchorElement;
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);

    expect(downloadTextFile('citation', { filename: 'citation.txt' })).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(removeChild).toHaveBeenCalledWith(anchor);
  });

  it('returns false for empty content', () => {
    expect(downloadTextFile('', { filename: 'x.md' })).toBe(false);
  });

  it('keeps a triggered download successful when window is unavailable for cleanup', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.stubGlobal('window', undefined);
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

    expect(downloadTextFile('citation bundle', { filename: 'citations.txt' })).toBe(true);
    expect(click).toHaveBeenCalled();
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

  it('downloadReferenceBundleFile adds a dated .txt extension', () => {
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
      downloadReferenceBundleFile('BibTeX\n...\n\nRIS\n...', 'Reference Bundle', { date: d }),
    ).toBe(true);
    expect(anchor.download).toBe('reference-bundle-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadAmaFile adds a dated .txt citation filename', () => {
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
    expect(downloadAmaFile('Arena AMA citation', 'Agent Citation AMA', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-ama-2026-07-16.txt');
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

  it('downloadHarvardFile adds a dated .txt citation filename', () => {
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
    expect(downloadHarvardFile('Arena Harvard citation', 'Agent Citation Harvard', { date: d })).toBe(
      true,
    );
    expect(anchor.download).toBe('agent-citation-harvard-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadIeeeFile adds a dated .txt citation filename', () => {
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
    expect(downloadIeeeFile('Arena IEEE citation', 'Agent Citation IEEE', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-ieee-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadMlaFile adds a dated .txt citation filename', () => {
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
    expect(downloadMlaFile('Arena MLA citation', 'Agent Citation MLA', { date: d })).toBe(true);
    expect(anchor.download).toBe('agent-citation-mla-2026-07-16.txt');
    expect(click).toHaveBeenCalled();
  });

  it('downloadCitationBundleFile adds a dated .txt bundle filename', () => {
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
      downloadCitationBundleFile('APA\n…\nMLA\n', 'All Citations Bundle', { date: d }),
    ).toBe(true);
    expect(anchor.download).toBe('all-citations-bundle-2026-07-16.txt');
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
