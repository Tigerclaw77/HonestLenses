import type { LensCore } from "@/LensCore";

/* ======================================================
   Public Types
====================================================== */

export type ResolveResult = {
  lensId: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reason?: {
    stage:
      | "no_candidates"
      | "family_lock"
      | "scored"
      | "ambiguous"
      | "low_score";
    family?: string | null;
    candidateCount: number;
    bestScore?: number;
    secondScore?: number;
    gap?: number;
  };
};

export type ResolveInput = {
  rawString: string;
  hasCyl?: boolean;
  hasAdd?: boolean;
  bc?: number | null;
  dia?: number | null;
  debug?: boolean;
};

/* ======================================================
   Normalization
====================================================== */

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string): string[] {
  return normalize(input).split(" ").filter(Boolean);
}

function includesAny(hay: string, needles: string[]) {
  for (const n of needles) {
    if (hay.includes(n)) return true;
  }
  return false;
}

/* ======================================================
   Family Derivation (NO LensCore pollution)
====================================================== */

function deriveFamily(coreId: string): string {
  return coreId
    .replace(/_AST$/, "")
    .replace(/_MF$/, "")
    .replace(/_XR$/, "")
    .replace(/_MAX$/, "")
    .replace(/_VITALITY$/, "");
}

/* ======================================================
   Daily Intent
====================================================== */

function detectDailyIntent(raw: string): boolean | null {
  const r = normalize(raw);

  const dailySignals = [
    "1 day",
    "1-day",
    "oneday",
    "one day",
    "daily disposable",
    "dailies",
  ];

  const monthlySignals = [
    "monthly",
    "30 day",
    "2 week",
    "two week",
    "biweekly",
  ];

  if (includesAny(r, dailySignals)) return true;
  if (includesAny(r, monthlySignals)) return false;

  return null;
}

function lensIsDaily(lens: LensCore): boolean {
  const name = normalize(lens.displayName);
  const repl = normalize(lens.replacement);

  if (repl.includes("daily")) return true;

  return (
    name.includes("1 day") ||
    name.includes("1-day") ||
    name.includes("oneday") ||
    name.includes("one day") ||
    name.includes("dailies") ||
    name.includes("daily disposable")
  );
}

/* ======================================================
   Family Scoring
====================================================== */

function scoreFamilyMatch(
  rawNorm: string,
  rawTokens: string[],
  family: string,
) {
  const famNorm = normalize(family);
  const famCompact = famNorm.replace(/\s+/g, "");
  const rawCompact = rawNorm.replace(/\s+/g, "");

  let score = 0;

  if (rawCompact.includes(famCompact)) score += 120;
  if (rawNorm.includes(famNorm)) score += 80;

  const famTokens = famNorm.split(" ").filter(Boolean);
  for (const t of famTokens) {
    if (rawTokens.includes(t)) score += 20;
  }

  const digitMatch = famCompact.match(/(\d+)$/);
  if (digitMatch) {
    const digit = digitMatch[1];
    if (rawCompact.includes(digit)) score += 10;
  }

  return score;
}

/* ======================================================
   Variant Scoring
====================================================== */

function scoreVariant(
  rawNorm: string,
  rawTokens: string[],
  lens: LensCore,
) {
  const name = normalize(lens.displayName);
  const nameTokens = name.split(" ").filter(Boolean);

  let score = 0;

  for (const t of nameTokens) {
    if (rawTokens.includes(t)) score += 10;
    if (rawNorm.includes(t)) score += 6;
  }

  const cues: Array<[string[], number]> = [
    [["astigmatism", "toric", "ast"], lens.type.toric ? 30 : -30],
    [["multifocal", "mf", "presbyopia"], lens.type.multifocal ? 30 : -30],
    [["xr"], lens.coreId.includes("XR") ? 25 : -10],
    [["max"], lens.coreId.includes("MAX") ? 20 : -10],
    [["vitality"], lens.displayName.toLowerCase().includes("vitality") ? 20 : -10],
  ];

  for (const [words, delta] of cues) {
    if (includesAny(rawNorm, words)) score += delta;
  }

  return score;
}

/* ======================================================
   Geometry Assist
====================================================== */

function scoreGeometry(input: ResolveInput, lens: LensCore) {
  let score = 0;

  if (input.bc != null) {
    const bcList = lens.parameters.baseCurve ?? [];
    if (bcList.includes(input.bc)) score += 8;
    else if (bcList.length > 0) score -= 3;
  }

  if (input.dia != null) {
    const diaList = lens.parameters.diameter ?? [];
    if (diaList.includes(input.dia)) score += 6;
    else if (diaList.length > 0) score -= 2;
  }

  return score;
}

/* ======================================================
   Structure Penalty (OCR Safety)
====================================================== */

function scoreStructure(input: ResolveInput, lens: LensCore) {
  let score = 0;

  const { hasCyl = false, hasAdd = false } = input;

  if (hasCyl && !lens.type.toric) score -= 40;
  if (!hasCyl && lens.type.toric) score -= 25;

  if (hasAdd && !lens.type.multifocal) score -= 40;
  if (!hasAdd && lens.type.multifocal) score -= 25;

  return score;
}

/* ======================================================
   MAIN RESOLVER
====================================================== */

export function resolveBrand(
  input: ResolveInput,
  lenses: readonly LensCore[],
): ResolveResult {

  const { rawString, debug = false } = input;

  const rawNorm = normalize(rawString);
  const rawTokens = tokenize(rawString);

  let candidates = [...lenses];

  if (candidates.length === 0) {
    return {
      lensId: null,
      score: 0,
      confidence: "low",
      reason: { stage: "no_candidates", candidateCount: 0 },
    };
  }

  /* Daily Intent Filter */

  const dailyIntent = detectDailyIntent(rawString);

  if (dailyIntent !== null) {
    const filtered = candidates.filter(
      (l) => lensIsDaily(l) === dailyIntent,
    );
    if (filtered.length > 0) candidates = filtered;
  }

  /* Family Lock */

  const families = new Map<string, LensCore[]>();

  for (const l of candidates) {
    const fam = deriveFamily(l.coreId);
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam)!.push(l);
  }

  let bestFamily: string | null = null;
  let bestFamilyScore = -Infinity;

  for (const fam of families.keys()) {
    const s = scoreFamilyMatch(rawNorm, rawTokens, fam);
    if (s > bestFamilyScore) {
      bestFamilyScore = s;
      bestFamily = fam;
    }
  }

  if (bestFamily && bestFamilyScore >= 80) {
    candidates = families.get(bestFamily)!;
  }

  /* Variant Scoring */

  let best: { id: string; score: number } | null = null;
  let second: { id: string; score: number } | null = null;

  for (const lens of candidates) {
    const fam = deriveFamily(lens.coreId);

    const s =
      scoreFamilyMatch(rawNorm, rawTokens, fam) +
      scoreVariant(rawNorm, rawTokens, lens) +
      scoreGeometry(input, lens) +
      scoreStructure(input, lens);

    if (!best || s > best.score) {
      second = best;
      best = { id: lens.coreId, score: s };
    } else if (!second || s > second.score) {
      second = { id: lens.coreId, score: s };
    }
  }

  const bestScore = best?.score ?? 0;
  const secondScore = second?.score ?? -999;
  const gap = bestScore - secondScore;

  if (debug) {
    console.log("[ResolverV2]", {
      rawString,
      bestFamily,
      bestFamilyScore,
      candidateCount: candidates.length,
      best,
      second,
      gap,
    });
  }

  /* Hard Rejects */

  if (!best || bestScore < 60) {
    return {
      lensId: null,
      score: bestScore,
      confidence: "low",
      reason: {
        stage: "low_score",
        family: bestFamily,
        candidateCount: candidates.length,
        bestScore,
        secondScore,
        gap,
      },
    };
  }

  if (gap < 12) {
    return {
      lensId: null,
      score: bestScore,
      confidence: "low",
      reason: {
        stage: "ambiguous",
        family: bestFamily,
        candidateCount: candidates.length,
        bestScore,
        secondScore,
        gap,
      },
    };
  }

  let confidence: "high" | "medium" | "low" = "medium";

  if (bestScore >= 140 && gap >= 30) confidence = "high";
  else if (bestScore >= 95 && gap >= 18) confidence = "medium";
  else confidence = "low";

  return {
    lensId: confidence === "low" ? null : best.id,
    score: bestScore,
    confidence,
    reason: {
      stage: "scored",
      family: bestFamily,
      candidateCount: candidates.length,
      bestScore,
      secondScore,
      gap,
    },
  };
}