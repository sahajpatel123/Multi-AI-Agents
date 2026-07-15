/** Decide how to position the window after a route change. */

export type ScrollIntent =
  | { type: 'top' }
  | { type: 'hash'; id: string };

/**
 * Hash links (e.g. /#how-it-works) should scroll to the target element.
 * Otherwise reset to the top of the new page.
 */
export function scrollIntentForLocation(pathname: string, hash: string): ScrollIntent {
  void pathname;
  const h = (hash || '').trim();
  if (h.startsWith('#') && h.length > 1) {
    // Basic sanitize: HTML ids are typically [A-Za-z0-9_-:.]
    const id = h.slice(1);
    if (/^[\w:.-]+$/.test(id)) {
      return { type: 'hash', id };
    }
  }
  return { type: 'top' };
}
