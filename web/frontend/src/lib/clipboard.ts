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
