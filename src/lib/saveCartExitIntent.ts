export const SAVE_CART_EXIT_INTENT_MIN_DWELL_MS = 8_000;
export const SAVE_CART_EXIT_INTENT_SESSION_KEY = "hl_save_cart_exit_prompt_seen";

type DesktopExitIntentInput = {
  cartHasItems: boolean;
  checkoutStarted: boolean;
  elapsedMs: number;
  promptAlreadySeen: boolean;
  relatedTargetIsNull: boolean;
  pointerExitedAboveViewport: boolean;
};

export function shouldShowSaveCartExitIntent({
  cartHasItems,
  checkoutStarted,
  elapsedMs,
  promptAlreadySeen,
  relatedTargetIsNull,
  pointerExitedAboveViewport,
}: DesktopExitIntentInput): boolean {
  return (
    cartHasItems &&
    !checkoutStarted &&
    elapsedMs >= SAVE_CART_EXIT_INTENT_MIN_DWELL_MS &&
    !promptAlreadySeen &&
    relatedTargetIsNull &&
    pointerExitedAboveViewport
  );
}
