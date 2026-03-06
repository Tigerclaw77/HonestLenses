/* =========================
   Numeric Formatters
========================= */

// Base Curve: tenths only (8.4, 8.6)
export function formatBC(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  return value.toFixed(1);
}

// SPH / CYL / ADD: hundredths (−1.25, +2.00)
export function formatHundredths(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  return value.toFixed(2);
}

/* =========================
   Constants
========================= */

export const CYL_OPTIONS = (() => {
  const values: number[] = [];
  for (let v = -0.75; v >= -6.0; v -= 0.5)
    values.push(Number(v.toFixed(2)));
  return values;
})();

export const AXIS_OPTIONS = Array.from(
  { length: 18 },
  (_, i) => (i + 1) * 10,
);

/* =========================
   Validation Helpers
========================= */

export function isEyeTouched(d: {
  coreId: string;
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  bc: string;
  color: string;
}) {
  return Boolean(
    d.coreId || d.sph || d.cyl || d.axis || d.add || d.bc || d.color,
  );
}

export function isValidFutureExpiration(value: string): boolean {
  if (!value) return false;

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  parsed.setHours(0, 0, 0, 0);

  return parsed >= today;
}