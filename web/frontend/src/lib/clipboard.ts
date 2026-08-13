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
