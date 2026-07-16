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

  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after the browser has a chance to start the download.
    window.setTimeout(() => {
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
