/* =========================
   Cart / Display Formatters
   (PURE FUNCTIONS)
========================= */

/**
 * Format signed RX numbers.
 * Examples:
 *  -1.25 → −1.25
 *   0.00 → 0
 *  +2.00 → +2
 */
export function fmtNum(n: number): string {
  const abs = Math.abs(n);
  const s = abs.toFixed(2).replace(/\.00$/, "");
  return n < 0 ? `−${s}` : `+${s}`;
}

/**
 * Format cents → USD string.
 * null / undefined → em dash
 */
export function fmtPrice(cents?: number | null): string {
  if (typeof cents !== "number") return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
