/**
 * Helpers for chat-style scroll containers (Discuss, Debate, long threads).
 * Pure — safe for tests and SSR.
 */

/** Default distance (px) from the bottom that still counts as “following” the live end. */
export const CHAT_NEAR_BOTTOM_PX = 96;

/**
 * True when the element is scrolled within `thresholdPx` of its bottom.
 * Empty / non-scrollable containers count as near bottom.
 */
export function isScrollNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number } | null | undefined,
  thresholdPx: number = CHAT_NEAR_BOTTOM_PX,
): boolean {
  if (!el) return true;
  const threshold = Number.isFinite(thresholdPx) ? Math.max(0, thresholdPx) : CHAT_NEAR_BOTTOM_PX;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  // Floating-point / subpixel tolerance
  return distance <= threshold + 1;
}

/**
 * Whether new content should auto-scroll the viewport.
 * Stick only when the user is already near the live end (or we force-stick, e.g. after send).
 */
export function shouldAutoScrollChat(opts: {
  stickToBottom: boolean;
  isNearBottom?: boolean;
}): boolean {
  if (opts.stickToBottom) return true;
  if (opts.isNearBottom) return true;
  return false;
}
