export function formatSphere(value: number) {
  return value.toFixed(2);
}

export function formatCylinder(value: number) {
  return value.toFixed(2);
}

export function formatDiameter(value: number) {
  return value.toFixed(1);
}

export function formatBaseCurve(value: number) {
  return value.toFixed(1);
}

export function formatAxis(value: number) {
  return value.toString().padStart(3, "0");
}

export function formatRxValue(value: unknown, decimals: number): string {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(decimals) : "-";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric.toFixed(decimals) : trimmed;
  }

  return String(value);
}
