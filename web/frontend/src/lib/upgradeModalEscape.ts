/**
 * Escape should dismiss UpgradeModal only when Razorpay checkout is idle,
 * so the checkout sheet is not dismissed underfoot.
 */
export function shouldUpgradeModalEscapeClose(checkoutPlan: string | null): boolean {
  return checkoutPlan == null;
}
