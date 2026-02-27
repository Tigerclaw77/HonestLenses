export function clearSessionState() {
  if (typeof window === "undefined") return;

  Object.keys(localStorage).forEach((key) => {
    // Clear all Honest Lenses session-scoped state
    if (
      key.startsWith("hl_") ||
      key.includes("Rx") ||
      key.includes("Draft") ||
      key.includes("order")
    ) {
      localStorage.removeItem(key);
    }
  });

  // Optional: also clear sessionStorage
  sessionStorage.clear();
}