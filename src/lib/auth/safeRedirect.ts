const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value ?? "");
  } catch {
    return fallback;
  }

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    CONTROL_OR_BACKSLASH.test(value) ||
    CONTROL_OR_BACKSLASH.test(decoded) ||
    decoded.startsWith("//")
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://honest-lenses.invalid");
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
