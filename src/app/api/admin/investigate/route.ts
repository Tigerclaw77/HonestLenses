import { NextResponse } from "next/server";
import { adminAuthErrorResponse, requireAdminUser } from "@/lib/admin-auth";
import { investigate } from "@/lib/admin/investigationServer";
import { parseInvestigation, type InvestigationMode } from "@/lib/admin/investigationModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set<InvestigationMode>(["search", "payment", "history", "unmatched", "date"]);

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("mode") as InvestigationMode | null;
  const mode = requestedMode && MODES.has(requestedMode) ? requestedMode : "search";
  let input;
  try {
    input = parseInvestigation(url.searchParams.get("q") ?? "", mode);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid search." },
      { status: 400, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }
  try {
    return NextResponse.json(await investigate(input), { headers: {
      "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    } });
  } catch (error) {
    console.error("[admin investigate] search failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Investigation search is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
