/* =========================================================
   LensCore Utilities
   - Segment-based power generation
   - Float-safe stepping
   - Sphere validation
========================================================= */

import type { PowerSpec } from "./types";

/* =========================================================
   Internal Helpers
========================================================= */

function roundToStep(value: number, step: number): number {
  const scaled = Math.round(value / step);
  return Number((scaled * step).toFixed(2));
}

function isNegativeZero(n: number): boolean {
  return n === 0 && 1 / n === -Infinity;
}

function normalizeZero(n: number): number {
  return isNegativeZero(n) ? 0 : n;
}

/* =========================================================
   Power Generation
========================================================= */

export function toPowerList(spec: PowerSpec): number[] {
  const out = new Set<number>();

  for (const seg of spec.segments) {
    const step = seg.step;

    let current = roundToStep(seg.min, step);
    const max = roundToStep(seg.max, step);

    let safety = 0;

    while (current <= max + 1e-9) {
      out.add(normalizeZero(current));
      current = roundToStep(current + step, step);

      safety++;
      if (safety > 5000) break;
    }
  }

  let list = Array.from(out);

  if (spec.exclude) {
    const excludes = new Set(
      spec.exclude.map((v) => normalizeZero(Number(v.toFixed(2))))
    );

    list = list.filter((v) => !excludes.has(v));
  }

  return list.sort((a, b) => a - b);
}

/* =========================================================
   Formatting
========================================================= */

export function formatSphere(value: number): string {
  if (value === 0) return "0.00";

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

/* =========================================================
   Validation
========================================================= */

export function isValidSphere(value: number, spec: PowerSpec): boolean {
  const allowed = toPowerList(spec);
  return allowed.includes(normalizeZero(Number(value.toFixed(2))));
}
