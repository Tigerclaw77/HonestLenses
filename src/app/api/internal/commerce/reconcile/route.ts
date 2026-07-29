export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { isCommerceV2Enabled } from "@/lib/commerce-v2/feature";
import { reconcilePayments } from "@/lib/commerce-v2/reconciliationService";
import { SupabaseCommerceRepository } from "@/lib/commerce-v2/repository";
import { createStripeGateway } from "@/lib/commerce-v2/stripeGateway";
import { hasInternalScopeAuthorization } from "@/lib/internal-auth";

export async function POST(request: Request) {
  if (!hasInternalScopeAuthorization(request, "commerce:reconcile")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isCommerceV2Enabled()) {
    return NextResponse.json(
      { error: "Commerce v2 is not enabled." },
      { status: 503 },
    );
  }

  try {
    const result = await reconcilePayments(
      {
        repository: new SupabaseCommerceRepository(),
        stripe: createStripeGateway(),
      },
      { source: "scheduled" },
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Commerce v2 reconciliation failed", { error });
    return NextResponse.json(
      { error: "Reconciliation failed." },
      { status: 500 },
    );
  }
}
