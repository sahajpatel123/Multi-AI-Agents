/** Pure helpers for single-open FAQ accordion state. */

export function toggleFaqOpen(
  currentOpen: number | null,
  clickedIndex: number,
): number | null {
  if (clickedIndex < 0) return currentOpen;
  return currentOpen === clickedIndex ? null : clickedIndex;
}

export function isFaqOpen(openIndex: number | null, index: number): boolean {
  return openIndex === index;
}
