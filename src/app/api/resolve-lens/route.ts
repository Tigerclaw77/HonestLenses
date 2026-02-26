import { NextResponse } from "next/server";
import { resolveBrand } from "@/lib/resolveBrand";
import { supabaseServer } from "@/lib/supabase-server";
import { rawLenses } from "@/data/lenses";
import type { Lens } from "@/data/lenses";
import { resolveBrandAI } from "../../../lib/server/resolveBrandAI";

export const runtime = "nodejs";

type ResolveRequestBody = {
  rawString: string;
  hasCyl?: boolean;
  bc?: number | null;
  dia?: number | null;
};

/* =========================
   Utilities
========================= */

function shouldDebug(req: Request): boolean {
  try {
    const url = new URL(req.url);
    return url.searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

/* =========================
   ADD Detection (Clinical Canon)
========================= */

type AddParseResult = {
  hasAdd: boolean;
  isAmbiguous: boolean;
};

/**
 * Rules:
 * - Numeric: +1.25, 1.50, +2.00 N, +2.00D
 * - Categorical: LOW, MED, HIGH
 * - Multiple valid ADD tokens → ambiguous (placeholder pad)
 * - MED N is invalid
 * - Garbage OCR does not count as ADD
 */
function deriveAddState(raw: string): AddParseResult {
  const normalized = raw.toUpperCase();

  // Numeric ADD with optional D/N modifier
  const numericRegex = /\+?\d\.\d{2}(?:\s?[DN])?/g;

  // Categorical ADD
  const categoricalRegex = /\b(LOW|MED|HIGH)\b/g;

  const numericMatches = normalized.match(numericRegex) ?? [];
  const categoricalMatches = normalized.match(categoricalRegex) ?? [];

  const totalValidAdds = numericMatches.length + categoricalMatches.length;

  // More than one ADD token → placeholder pad → ambiguous
  if (totalValidAdds > 1) {
    return {
      hasAdd: false,
      isAmbiguous: true,
    };
  }

  if (totalValidAdds === 1) {
    return {
      hasAdd: true,
      isAmbiguous: false,
    };
  }

  return {
    hasAdd: false,
    isAmbiguous: false,
  };
}

/* =========================
   MAIN ROUTE
========================= */

export async function POST(req: Request) {
  const debug = shouldDebug(req);

  try {
    const body: ResolveRequestBody = await req.json();
    const { rawString, hasCyl = false, bc, dia } = body;

    if (!rawString || typeof rawString !== "string") {
      return NextResponse.json({ error: "Missing rawString" }, { status: 400 });
    }

    const lensList = rawLenses as Lens[];
    const addState = deriveAddState(rawString);
    const derivedHasAdd = addState.hasAdd;

    if (debug) {
      console.log("---- RESOLVE-LENS DEBUG ----");
      console.log("Raw:", rawString);
      console.log("Flags:", { hasCyl, derivedHasAdd, bc, dia });
      console.log("Lens list size:", lensList.length);
      console.log("ADD State:", addState);
    }

    /* =========================
       1️⃣ Hybrid deterministic resolver
    ========================= */

    const hybrid = resolveBrand(
      {
        rawString,
        hasCyl,
        hasAdd: derivedHasAdd,
        bc,
        dia,
      },
      lensList,
    );

    if (debug) {
      console.log("Hybrid:", hybrid);
    }

    /* =========================
       HIGH CONFIDENCE SHORT CIRCUIT
    ========================= */

    if (hybrid.confidence === "high" && hybrid.lensId) {
      await logAudit({
        rawString,
        hybridLensId: hybrid.lensId,
        aiLensId: null,
        finalLensId: hybrid.lensId,
        agreement: true,
      });

      return NextResponse.json({
        finalLensId: hybrid.lensId,
        confidence: "high",

        proposedLensId: hybrid.lensId,
        proposalConfidence: "high",

        hybridLensId: hybrid.lensId,
        aiLensId: null,
        agreement: true,
        audited: false,
      });
    }

    /* =========================
       2️⃣ AI Rescue (only when needed)
    ========================= */

    let aiLensId: string | null = null;

    if (hybrid.confidence === "low") {
      const candidates = lensList.map((l) => ({
        lens_id: l.lens_id,
        label: `${l.brand} ${l.name}`.replace(/\s+/g, " ").trim(),
      }));

      aiLensId =
        candidates.length <= 15
          ? await resolveBrandAI(rawString, candidates)
          : null;
    }

    const agreement =
      hybrid.lensId !== null && aiLensId !== null && hybrid.lensId === aiLensId;

    /* =========================
       3️⃣ Final Decision
    ========================= */

    let finalLensId: string | null = null;
    let confidence: "high" | "medium" | "low" = hybrid.confidence;

    if (
      (hybrid.confidence === "high" || hybrid.confidence === "medium") &&
      hybrid.lensId
    ) {
      finalLensId = hybrid.lensId;
    } else if (hybrid.confidence === "low") {
      if (aiLensId) {
        finalLensId = aiLensId;
        confidence = "medium";
      } else {
        finalLensId = null;
        confidence = "low";
      }
    }

    if (debug) {
      console.log("Final:", { finalLensId, confidence, agreement });
    }

    await logAudit({
      rawString,
      hybridLensId: hybrid.lensId,
      aiLensId,
      finalLensId,
      agreement,
    });

    return NextResponse.json({
      finalLensId,
      confidence,

      proposedLensId: finalLensId,
      proposalConfidence: confidence,

      hybridLensId: hybrid.lensId,
      aiLensId,
      agreement,
      audited: true,
    });
  } catch (err) {
    console.error("Resolve Lens Error:", err);
    return NextResponse.json({ error: "Resolver failed" }, { status: 500 });
  }
}

/* =========================
   Audit Logging
========================= */

async function logAudit({
  rawString,
  hybridLensId,
  aiLensId,
  finalLensId,
  agreement,
}: {
  rawString: string;
  hybridLensId: string | null;
  aiLensId: string | null;
  finalLensId: string | null;
  agreement: boolean;
}) {
  try {
    await supabaseServer.from("resolver_audits").insert({
      raw_string: rawString,
      hybrid_lens_id: hybridLensId,
      ai_lens_id: aiLensId,
      final_lens_id: finalLensId,
      agreement,
    });
  } catch (e) {
    console.error("Audit logging failed:", e);
  }
}
