export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getPrescriptionHandoffStatus } from "@/lib/prescriptionHandoff";
import { getPrescriptionHandoffByToken } from "@/lib/server/prescriptionHandoffStore";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";

export async function POST(request: Request) {
  const rateLimit = await enforceRateLimit(request, {
    scope: "prescription-handoff-mobile-status",
    limit: 60,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const handoff = await getPrescriptionHandoffByToken(body?.token);
  if (!handoff) {
    return NextResponse.json({ error: "This mobile upload link is invalid." }, { status: 404 });
  }
  return NextResponse.json({ status: getPrescriptionHandoffStatus(handoff) });
}
