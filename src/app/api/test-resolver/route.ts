import { NextResponse } from "next/server";
import { resolveBrand } from "@/lib/resolveBrand";
import { rawLenses } from "@/data/lenses";



const CONFIDENCE_THRESHOLD = 11;

export async function GET() {
  const tests = [
    { input: "Oasys Max 1-Day", hasCyl: false, hasAdd: false },
    { input: "Oasys Max 1D MF", hasCyl: false, hasAdd: true },
    { input: "Oasys 1 day", hasCyl: false, hasAdd: false },
    { input: "Oasys 1-Day Multifocal", hasCyl: false, hasAdd: true },
    { input: "Oasys Max Toric", hasCyl: true, hasAdd: false },
    { input: "Oasys 1D", hasCyl: false, hasAdd: false },
    { input: "Oasys", hasCyl: false, hasAdd: false },
    { input: "Oasys 1 day tor", hasCyl: true, hasAdd: false },
    { input: "Oasys MF", hasCyl: false, hasAdd: true },
  ];

  const results = tests.map((t) => {
    const result = resolveBrand(
      {
        rawString: t.input,
        hasCyl: t.hasCyl,
        hasAdd: t.hasAdd,
      },
      rawLenses
    );

    const isHighConfidence = result.score >= CONFIDENCE_THRESHOLD;

    return {
      input: t.input,
      hasCyl: t.hasCyl,
      hasAdd: t.hasAdd,
      lensId: result.lensId,
      score: result.score,
      confidence: isHighConfidence ? "high" : "low",
    };
  });

  return NextResponse.json(results);
}