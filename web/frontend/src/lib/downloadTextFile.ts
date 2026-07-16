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
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, FILENAME_MAX)
    .replace(/-+$/g, '');
  return base || fallback;
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

export function downloadMarkdownFile(content: string, filenameStem: string): boolean {
  const stem = sanitizeDownloadFilename(filenameStem, 'arena-export');
  return downloadTextFile(content, {
    filename: `${stem}.md`,
    mimeType: 'text/markdown;charset=utf-8',
  });
}
