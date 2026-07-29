export function boundedText(
  value: unknown,
  maxLength: number,
  required = false,
): string | null {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) return null;
  return normalized;
}

export function isEmailAddress(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export function isUsState(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

export function isUsPostalCode(value: string): boolean {
  return /^\d{5}(?:-\d{4})?$/.test(value);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
