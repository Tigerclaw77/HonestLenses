export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { POST as processPrescriptionUpload } from "@/app/api/orders/[id]/rx-ocr/route";
import { createGuestOrderCookieValue } from "@/lib/order-access";
import { getTrustedSiteOrigin } from "@/lib/security/siteOrigin";
import { enforceRateLimit, rateLimitErrorResponse } from "@/lib/security/rateLimit";
import {
  claimPrescriptionHandoff,
  completePrescriptionHandoff,
  getPrescriptionHandoffByToken,
  releasePrescriptionHandoffClaim,
} from "@/lib/server/prescriptionHandoffStore";
import { getPrescriptionHandoffStatus } from "@/lib/prescriptionHandoff";

export async function POST(request: NextRequest) {
  const rateLimit = await enforceRateLimit(request, {
    scope: "prescription-handoff-mobile-upload",
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) return rateLimitErrorResponse(rateLimit);

  const form = await request.formData();
  const token = form.get("token");
  const file = form.get("file");
  if (typeof token !== "string" || !(file instanceof File)) {
    return NextResponse.json({ error: "A valid photo is required.", code: "invalid_upload" }, { status: 400 });
  }

  let claim: Awaited<ReturnType<typeof claimPrescriptionHandoff>>;
  try {
    claim = await claimPrescriptionHandoff(token);
  } catch (error) {
    console.error("MOBILE PRESCRIPTION HANDOFF CLAIM ERROR:", error);
    return NextResponse.json(
      { error: "We couldn't start that upload. Please try again.", code: "handoff_claim_failed" },
      { status: 500 },
    );
  }

  if (!claim) {
    const current = await getPrescriptionHandoffByToken(token);
    if (!current) {
      return NextResponse.json(
        { error: "This mobile upload link is invalid.", code: "handoff_invalid" },
        { status: 404 },
      );
    }

    const status = getPrescriptionHandoffStatus(current);
    if (status === "expired") {
      return NextResponse.json(
        { error: "This mobile upload link has expired.", code: "handoff_expired" },
        { status: 409 },
      );
    }
    if (status === "completed") {
      return NextResponse.json(
        { error: "This mobile upload link was already used.", code: "handoff_completed" },
        { status: 409 },
      );
    }

    console.warn("MOBILE PRESCRIPTION HANDOFF CLAIM CONFLICT:", {
      handoffId: current.id,
      status,
    });
    return NextResponse.json(
      { error: "Another upload is processing. Wait a moment and try again.", code: "handoff_busy" },
      { status: 409 },
    );
  }

  try {
    const internalForm = new FormData();
    internalForm.set("file", file);
    const origin = getTrustedSiteOrigin();
    const headers = new Headers({
      cookie: `hl_guest_order=${encodeURIComponent(createGuestOrderCookieValue(claim.row.order_id))}`,
      origin,
    });
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) headers.set("x-forwarded-for", forwarded);
    const internalRequest = new NextRequest(
      new URL(`/api/orders/${claim.row.order_id}/rx-ocr`, origin),
      { method: "POST", headers, body: internalForm },
    );
    const response = await processPrescriptionUpload(internalRequest, {
      params: Promise.resolve({ id: claim.row.order_id }),
    });
    const responseBody = (await response.clone().json().catch(() => null)) as { ok?: boolean } | null;
    if (!response.ok || responseBody?.ok !== true) {
      await releasePrescriptionHandoffClaim(claim.row.id, claim.claimId);
      return response;
    }
    await completePrescriptionHandoff(claim.row.id, claim.claimId);
    return response;
  } catch (error) {
    await releasePrescriptionHandoffClaim(claim.row.id, claim.claimId);
    console.error("MOBILE PRESCRIPTION UPLOAD ERROR:", error);
    return NextResponse.json(
      { error: "We couldn't upload that photo. Please try again.", code: "mobile_upload_failed" },
      { status: 500 },
    );
  }
}
