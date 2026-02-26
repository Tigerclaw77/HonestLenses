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
  debug?: boolean;
};

/* =========================
   Normalization
========================= */

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  return normalize(input).split(" ").filter(Boolean);
}

/* =========================
   Manufacturer Lock
   (derived from lens_id prefix)
========================= */

function manufacturerPrefix(lensId: string): string | null {
  if (lensId.startsWith("V")) return "V";
  if (lensId.startsWith("CV")) return "CV";
  if (lensId.startsWith("BL")) return "BL";
  if (lensId.startsWith("A")) return "A";
  return null;
}

function detectManufacturerIntent(raw: string): string | null {
  const r = normalize(raw);

  if (r.includes("acuvue")) return "V";
  if (r.includes("coopervision") || r.includes("cvh")) return "CV";
  if (r.includes("alcon")) return "A";
  if (r.includes("bausch") || r.includes("b+l")) return "BL";

  return null;
}

/* =========================
   STRICT Daily Intent Detection
   Only explicit cues.
========================= */

function detectDailyIntent(raw: string): boolean {
  const r = normalize(raw);

  return (
    r.includes("1 day") ||
    r.includes("1-day") ||
    r.includes("daily disposable") ||
    r.includes("dailies")
  );
}

/* =========================
   Lens Daily Check
========================= */

function lensIsDaily(lens: Lens): boolean {
  const name = normalize(`${lens.brand} ${lens.name}`);

  return (
    name.includes("1 day") ||
    name.includes("1-day") ||
    name.includes("daily disposable") ||
    name.includes("dailies")
  );
}

/* =========================
   Scoring
========================= */

function scoreLens(
  inputTokens: string[],
  lens: Lens,
  input: ResolveInput,
): number {
  let score = 0;

  const brandTokens = tokenize(lens.brand);
  const nameTokens = tokenize(lens.name);

  for (const token of inputTokens) {
    if (brandTokens.includes(token)) score += 60;
    if (nameTokens.includes(token)) score += 30;
  }

  if (input.bc != null && lens.baseCurves?.includes(input.bc)) {
    score += 5;
  }

  if (
    input.dia != null &&
    lens.diameter != null &&
    Math.abs(lens.diameter - input.dia) < 0.2
  ) {
    score += 5;
  }

  return score;
}

/* =========================
   MAIN RESOLVER
========================= */

export function resolveBrand(
  input: ResolveInput,
  lenses: Lens[],
): ResolveResult {
  const { rawString, hasCyl = false, hasAdd = false } = input;

  const tokens = tokenize(rawString);
  const inputIsDaily = detectDailyIntent(rawString);

  let candidateLenses = lenses;

  console.log("[Resolver] Raw:", rawString);
  console.log("[Resolver] Initial lens count:", candidateLenses.length);

  /* 1️⃣ Manufacturer Lock */

  const manufacturerIntent = detectManufacturerIntent(rawString);
  if (manufacturerIntent) {
    candidateLenses = candidateLenses.filter(
      (l) => manufacturerPrefix(l.lens_id) === manufacturerIntent,
    );
    console.log("[Resolver] Manufacturer lock:", manufacturerIntent);
  }

  /* 2️⃣ Structural Filtering */

  candidateLenses = candidateLenses.filter((l) =>
    hasCyl ? l.toric : !l.toric,
  );

  candidateLenses = candidateLenses.filter((l) =>
    hasAdd ? l.multifocal : !l.multifocal,
  );

  console.log("[Resolver] After structural filter:", candidateLenses.length);

  /* 3️⃣ Daily Partition */

  if (inputIsDaily) {
    const dailyOnly = candidateLenses.filter((l) => lensIsDaily(l));
    if (dailyOnly.length > 0) {
      candidateLenses = dailyOnly;
    }
  } else {
    const nonDaily = candidateLenses.filter((l) => !lensIsDaily(l));
    if (nonDaily.length > 0) {
      candidateLenses = nonDaily;
    }
  }

  console.log("[Resolver] After daily filter:", candidateLenses.length);

  /* 4️⃣ Score */

  let bestScore = -Infinity;
  let secondBest = -Infinity;
  let bestLensId: string | null = null;

  for (const lens of candidateLenses) {
    const score = scoreLens(tokens, lens, input);

    if (score > bestScore) {
      secondBest = bestScore;
      bestScore = score;
      bestLensId = lens.lens_id;
    } else if (score > secondBest) {
      secondBest = score;
    }
  }

  const gap = bestScore - secondBest;

  console.log("[Resolver] Best score:", bestScore);
  console.log("[Resolver] Gap:", gap);

  /* 5️⃣ Hard Fail Rules */

  if (!bestLensId || gap <= 0) {
    console.log("[Resolver] FAIL (tie or no clear winner)");
    return { lensId: null, score: 0, confidence: "low" };
  }

  /* 6️⃣ Confidence */

  let confidence: "high" | "medium" | "low" = "low";

  if (bestScore >= 90 && gap >= 20) confidence = "high";
  else if (bestScore >= 60 && gap >= 10) confidence = "medium";

  console.log(
    `[Resolver] Final: ${bestLensId} (${confidence})`
  );

  return {
    lensId: confidence === "low" ? null : bestLensId,
    score: bestScore,
    confidence,
  };
}
