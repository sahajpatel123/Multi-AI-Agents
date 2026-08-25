/**
 * Trigger a client-side download of a text file (markdown, plain text, etc.).
 * Safe no-op when document/window is unavailable (SSR / tests without DOM).
 */

const FILENAME_MAX = 80;

/** Sanitize user-facing text into a safe, short download stem. */
export function sanitizeDownloadFilename(raw: string, fallback = 'arena-export'): string {
  const base = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/['’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FILENAME_MAX)
    .replace(/-+$/g, '');
  return base || fallback;
}

/** Local calendar date as `yyyy-mm-dd` for download stems. */
export function formatDownloadDateSuffix(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Append a calendar date to a sanitized stem so repeated exports
 * do not silently overwrite each other in the Downloads folder.
 */
export function withDownloadDate(
  rawStem: string,
  date: Date = new Date(),
  fallback = 'arena-export',
): string {
  const suffix = formatDownloadDateSuffix(date);
  const maxBase = Math.max(8, FILENAME_MAX - 1 - suffix.length);
  const base = sanitizeDownloadFilename(rawStem, fallback).slice(0, maxBase).replace(/-+$/g, '');
  return `${base || fallback}-${suffix}`;
}

function revokeObjectUrl(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore cleanup failures */
  }
}

function revokeObjectUrlAfterDownload(url: string): void {
  try {
    if (typeof globalThis.setTimeout === 'function') {
      globalThis.setTimeout(() => revokeObjectUrl(url), 1500);
      return;
    }
  } catch {
    // Fall through to synchronous cleanup when the host timer is unavailable.
  }
  revokeObjectUrl(url);
}

/**
 * Download `content` as a file. Returns true when the browser accepted the trigger.
 */
export function downloadTextFile(
  content: string,
  opts: { filename: string; mimeType?: string },
): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const text = content ?? '';
  if (!text) return false;

  let filename = (opts.filename || 'download.txt').trim() || 'download.txt';
  // Strip path separators that some browsers interpret badly.
  filename = filename.replace(/[/\\?%*:|"<>]/g, '-').replace(/^\.+/, '') || 'download.txt';

  const mime = (opts.mimeType || 'text/plain;charset=utf-8').trim() || 'text/plain;charset=utf-8';

  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  let appended = false;
  try {
    const blob = new Blob([text], { type: mime });
    url = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    appended = true;
    anchor.click();
    document.body.removeChild(anchor);
    appended = false;
    // Revoke after the browser has a chance to start the download. If DOM
    // setup or the click throws, the catch below revokes it immediately so a
    // failed citation export cannot leave a blob URL behind.
    revokeObjectUrlAfterDownload(url);
    return true;
  } catch {
    if (appended && anchor) {
      try {
        document.body.removeChild(anchor);
      } catch {
        /* ignore secondary DOM cleanup failures */
      }
    }
    if (url) revokeObjectUrl(url);
    return false;
  }
}

/**
 * Download markdown. Filenames include today’s date by default
 * (e.g. `agent-watchlist-2026-07-16.md`) so re-exports stay distinct.
 * Pass `{ dated: false }` to keep a stable stem (tests / rare callers).
 */
export function downloadMarkdownFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.md`,
    mimeType: 'text/markdown;charset=utf-8',
  });
}

/**
 * Download JSON with the same dated filename behavior as Markdown exports.
 * Keeping the MIME type here makes structured exports open cleanly in editors
 * and keeps callers from duplicating browser download details.
 */
export function downloadJsonFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.json`,
    mimeType: 'application/json;charset=utf-8',
  });
}

/**
 * Download a standalone HTML report with a browser-friendly extension and
 * MIME type. Keeping this wrapper beside JSON avoids duplicating the shared
 * filename/date handling in report pages.
 */
export function downloadHtmlFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.html`,
    mimeType: 'text/html;charset=utf-8',
  });
}

/**
 * Download a CSL-JSON citation with a reference-manager-friendly extension
 * and MIME type.
 */
export function downloadCslJsonFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.csl.json`,
    mimeType: 'application/vnd.citationstyles.csl+json;charset=utf-8',
  });
}

/**
 * Download CSV with the same dated filename behavior as the other text
 * exports. Keeping this wrapper in one place gives callers a spreadsheet MIME
 * type without duplicating filename handling.
 */
export function downloadCsvFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.csv`,
    mimeType: 'text/csv;charset=utf-8',
  });
}

/**
 * Download a BibTeX citation with a citation-manager-friendly extension and
 * MIME type. Keeping this alongside the other text exports prevents callers
 * from duplicating dated filename handling.
 */
export function downloadBibtexFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.bib`,
    mimeType: 'application/x-bibtex;charset=utf-8',
  });
}

/**
 * Download an RIS citation with a reference-manager-friendly extension and
 * MIME type. Keeping this beside BibTeX avoids duplicating filename safety.
 */
export function downloadRisFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.ris`,
    mimeType: 'application/x-research-info-systems;charset=utf-8',
  });
}

/**
 * Download a plain-text citation with a dated filename. Keeping this wrapper
 * beside the structured citation exports gives bibliography users a file they
 * can attach or edit without duplicating filename safety in the page.
 */
export function downloadApaFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text Harvard-style citation with a format-specific
 * filename. Keeping this beside the other prose citation wrappers gives
 * bibliography users a predictable `.txt` export without duplicating
 * browser download handling.
 */
export function downloadHarvardFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text Chicago bibliography citation with a dated filename.
 * Keeping this wrapper beside the APA helper gives citation users a stable
 * format-specific filename without duplicating browser download handling.
 */
export function downloadChicagoFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text MLA bibliography citation with a format-specific
 * filename. Keeping this beside the other prose citation wrappers gives
 * users a matching file export for every style available in the share page.
 */
export function downloadMlaFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text IEEE-style citation with a format-specific filename.
 * Keeping this beside the other citation wrappers gives bibliography users a
 * predictable `.txt` export without duplicating browser download handling.
 */
export function downloadIeeeFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text Vancouver/NLM-style citation with a format-specific
 * filename. Keeping this beside the other prose citation wrappers gives
 * bibliography users a predictable `.txt` export without duplicating
 * browser download handling.
 */
export function downloadVancouverFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download a plain-text AMA-style citation with a format-specific filename.
 * Keeping this beside the other prose citation wrappers gives bibliography
 * users a predictable `.txt` export without duplicating browser handling.
 */
export function downloadAmaFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download the labeled multi-style citation bundle as plain text with a
 * format-specific filename. Keeping this beside the per-style wrappers gives
 * bundle users a predictable `.txt` export without duplicating browser
 * download handling.
 */
export function downloadCitationBundleFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download the labeled BibTeX/RIS/CSL-JSON reference-manager bundle as text.
 * A composite file stays intentionally plain text so users can inspect or
 * split it before importing the individual sections into their tool.
 */
export function downloadReferenceBundleFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.txt`,
    mimeType: 'text/plain;charset=utf-8',
  });
}

/**
 * Download an EndNote XML citation with the extension and MIME type expected
 * by reference managers.
 */
export function downloadEndnoteFile(
  content: string,
  filenameStem: string,
  opts?: { dated?: boolean; date?: Date },
): boolean {
  const dated = opts?.dated !== false;
  const stem = dated
    ? withDownloadDate(filenameStem, opts?.date, 'arena-export')
    : sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.xml`,
    mimeType: 'application/xml;charset=utf-8',
  });
}

/**
 * Trigger client-side download of a Blob (e.g. CSV file from backend stream).
 * Safe no-op when document/window is unavailable.
 */
export function downloadBlobFile(
  blob: Blob,
  filename: string,
): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  if (!blob || !(blob instanceof Blob)) return false;

  let safeName = (filename || 'download.csv').trim() || 'download.csv';
  safeName = safeName.replace(/[/\\?%*:|"<>]/g, '-').replace(/^\.+/, '') || 'download.csv';

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    globalThis.setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }, 1500);
    return true;
  } catch {
    return false;
  }
}
