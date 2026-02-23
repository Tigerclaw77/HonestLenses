// /lib/resolveBrand.ts

import type { Lens } from "@/data/lenses";

export type ResolveResult = {
  lensId: string | null;
  score: number;
};

type ResolveInput = {
  rawString: string;
  hasCyl?: boolean;
  hasAdd?: boolean;
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
  return normalize(input).split(" ");
}

//
// --- Small Synonym Map (Tight Scope)
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
  max: ["max"],
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

function scoreLens(inputTokens: string[], lens: Lens): number {
  let score = 0;

  const brandTokens = tokenize(lens.brand);
  const nameTokens = tokenize(lens.name);

  const fullInput = normalize(inputTokens.join(" "));
  const fullName = normalize(`${lens.brand} ${lens.name}`);

  // Phrase containment boost
  if (fullName.includes(fullInput)) {
    score += 3;
  }

  // Brand + Name token matches
  for (const token of inputTokens) {
    if (brandTokens.includes(token)) score += 3;
    if (nameTokens.includes(token)) score += 2;
  }

  // Token-based feature hints (still allowed but weaker than structural filtering)
  if (inputTokens.includes("toric") && lens.toric) score += 4;
  if (inputTokens.includes("multifocal") && lens.multifocal) score += 4;

  if (inputTokens.includes("toric") && !lens.toric) score -= 2;
  if (inputTokens.includes("multifocal") && !lens.multifocal) score -= 2;

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

  // --- Structural filtering based on Rx ---
  const candidateLenses = lenses.filter((lens) => {
    // Toric logic
    if (hasCyl && !lens.toric) return false;
    if (!hasCyl && lens.toric) return false;

    // Multifocal logic
    if (hasAdd && !lens.multifocal) return false;
    if (!hasAdd && lens.multifocal) return false;

    return true;
  });

  let bestScore = 0;
  let bestLensId: string | null = null;

  for (const lens of candidateLenses) {
    const score = scoreLens(expandedTokens, lens);

    if (score > bestScore) {
      bestScore = score;
      bestLensId = lens.lens_id;
    }
  }

  return {
    lensId: bestLensId,
    score: bestScore,
  };
}