/**
 * Copy text to the clipboard with a textarea fallback for non-secure
 * contexts and denied permissions.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }

  const activeElement = document.activeElement as HTMLElement | null;
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    // Never leave the temporary textarea behind, even when execCommand or a
    // DOM call throws. Restoring focus is best-effort: the user clicked a
    // copy control, and the control (or the field they were editing) should
    // keep keyboard focus after the fallback runs.
    textarea?.remove();
    if (activeElement) {
      try {
        activeElement.focus();
      } catch {
        /* focus restoration is best-effort */
      }
    }
  }
}

/**
 * Copy CSV text to the clipboard as a real `text/csv` payload when the
 * browser supports ClipboardItem, so spreadsheet apps can parse pasted
 * transcript rows instead of receiving one plain-text blob. Also advertises
 * a `text/plain` representation for regular editors, and falls back to the
 * generic text helper when the structured clipboard path is unavailable or
 * rejected.
 */
export async function copyCsvToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.write
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/csv': new Blob([text], { type: 'text/csv;charset=utf-8' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through to the generic text copy path */
  }

  return copyToClipboard(text);
}

/**
 * Copy Markdown with both its structured MIME type and a plain-text
 * representation. Editors that understand Markdown can preserve the format,
 * while ordinary text fields continue to receive the same readable content.
 */
export async function copyMarkdownToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const ClipboardItemConstructor =
      typeof ClipboardItem === 'function' ? ClipboardItem : undefined;
    if (ClipboardItemConstructor && typeof clipboard?.write === 'function') {
      await clipboard.write([
        new ClipboardItemConstructor({
          'text/markdown': new Blob([text], { type: 'text/markdown;charset=utf-8' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through to the generic text copy path */
  }

  return copyToClipboard(text);
}

/**
 * Copy JSON with both its structured MIME type and a plain-text
 * representation. JSON-aware destinations can parse the payload directly,
 * while ordinary editors continue to receive the same readable text.
 */
export async function copyJsonToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.write
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'application/json': new Blob([text], { type: 'application/json;charset=utf-8' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through to the generic text copy path */
  }

  return copyToClipboard(text);
}

/**
 * Copy newline-delimited JSON with a structured NDJSON representation and a
 * plain-text fallback. JSONL is useful in terminals, notebooks, and import
 * tools, so keep its MIME type distinct from a single JSON document.
 */
export async function copyJsonlToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    const ClipboardItemConstructor =
      typeof ClipboardItem === 'function' ? ClipboardItem : undefined;
    if (ClipboardItemConstructor && typeof clipboard?.write === 'function') {
      await clipboard.write([
        new ClipboardItemConstructor({
          'application/x-ndjson': new Blob([text], { type: 'application/x-ndjson' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through to the generic text copy path */
  }

  return copyToClipboard(text);
}

/**
 * Copy an HTML report with both rich and plain-text representations. Rich
 * editors can preserve the formatted share, while ordinary fields receive a
 * readable fallback instead of the full document markup.
 */
export async function copyHtmlToClipboard(html: string, plainText = html): Promise<boolean> {
  if (!html) return false;
  const fallbackText = plainText || html;

  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.write
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html;charset=utf-8' }),
          'text/plain': new Blob([fallbackText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through to the generic text copy path */
  }

  return copyToClipboard(fallbackText);
}
