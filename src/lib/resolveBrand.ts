// /lib/resolveBrand.ts

import type { Lens } from "@/data/lenses";

export type ResolveResult = {
  lensId: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
};

type ResolveInput = {
  rawString: string;
  hasCyl?: boolean;
  hasAdd?: boolean;
  bc?: number | null;
  dia?: number | null;
};

//
// --- Normalize ---
//

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

//
// --- Tokenize ---
//

export function tokenize(input: string): string[] {
  return normalize(input).split(" ").filter(Boolean);
}

//
// --- Synonym Map ---
//

const SYNONYM_MAP: Record<string, string[]> = {
  av: ["acuvue"],
  ao: ["optix"],
  "1d": ["1day", "1", "day"],
  one: ["1"],
  astig: ["astigmatism", "toric"],
  tor: ["toric"],
  mf: ["multifocal"],
  multi: ["multifocal"],
};

function expandTokens(tokens: string[]): string[] {
  const expanded = new Set<string>();

  for (const token of tokens) {
    expanded.add(token);
    if (SYNONYM_MAP[token]) {
      for (const synonym of SYNONYM_MAP[token]) {
        expanded.add(synonym);
      }
    }
  }

  return Array.from(expanded);
}

//
// --- Score One Lens ---
//

function scoreLens(
  inputTokens: string[],
  lens: Lens,
  input: ResolveInput
): number {
  let score = 0;

  const brandTokens = tokenize(lens.brand);
  const nameTokens = tokenize(lens.name);

  const fullInput = normalize(inputTokens.join(" "));
  const fullName = normalize(`${lens.brand} ${lens.name}`);

  //
  // 1️⃣ BRAND ROOT DOMINANCE (Most Important)
  //

  for (const token of inputTokens) {
    if (brandTokens.includes(token)) {
      score += 30; // dominant signal
    }
  }

  //
  // 2️⃣ NAME TOKEN MATCHES (Secondary Identity)
  //

  for (const token of inputTokens) {
    if (nameTokens.includes(token)) {
      score += 18;
    }
  }

  //
  // 3️⃣ Phrase containment (bonus, but not overpowering)
  //

  if (fullInput.length > 5 && fullName.includes(fullInput)) {
    score += 20;
  }

  //
  // 4️⃣ Structural Class Matching (Moderate Strength)
  //

  if (input.hasCyl && lens.toric) score += 20;
  if (!input.hasCyl && lens.toric) score -= 20; // strong penalty

  if (input.hasAdd && lens.multifocal) score += 20;
  if (!input.hasAdd && lens.multifocal) score -= 25; // strong penalty

  //
  // 5️⃣ Negative Evidence (mild)
  //

  for (const token of nameTokens) {
    if (!inputTokens.includes(token)) {
      score -= 2;
    }
  }

  //
  // 6️⃣ BC / DIA Tie-Breakers (Light)
  //

  if (input.bc != null && lens.baseCurves?.length) {
    if (lens.baseCurves.includes(input.bc)) {
      score += 6;
    } else {
      score -= 3;
    }
  }

  if (input.dia != null && lens.diameter) {
    if (Math.abs(lens.diameter - input.dia) < 0.15) {
      score += 6;
    } else {
      score -= 3;
    }
  }

  return score;
}

//
// --- Resolver ---
//

export function resolveBrand(
  input: ResolveInput,
  lenses: Lens[]
): ResolveResult {
  const { rawString, hasCyl = false, hasAdd = false } = input;

  const baseTokens = tokenize(rawString);
  const expandedTokens = expandTokens(baseTokens);

  const candidateLenses = lenses.filter((lens) => {
    if (hasCyl && !lens.toric) return false;
    if (hasAdd && !lens.multifocal) return false;
    return true;
  });

  let bestScore = -Infinity;
  let secondBestScore = -Infinity;
  let bestLensId: string | null = null;

  for (const lens of candidateLenses) {
    const score = scoreLens(expandedTokens, lens, input);

    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestLensId = lens.lens_id;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  //
  // --- Confidence Logic ---
  //

  let confidence: "high" | "medium" | "low" = "low";

  const gap = bestScore - secondBestScore;

  if (bestScore >= 50 && gap >= 15) {
    confidence = "high";
  } else if (bestScore >= 35 && gap >= 8) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    lensId: bestLensId,
    score: bestScore,
    confidence,
  };
}