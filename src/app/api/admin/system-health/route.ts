import { NextResponse } from "next/server";

import {
  adminAuthErrorResponse,
  logAdminAuthFailure,
  requireAdminUser,
} from "@/lib/admin-auth";
import { isCommerceV2Enabled } from "@/lib/commerce-v2/feature";
import { SupabaseCommerceRepository } from "@/lib/commerce-v2/repository";

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) {
    logAdminAuthFailure("GET /api/admin/system-health", auth);
    return adminAuthErrorResponse(auth);
  }

  if (!isCommerceV2Enabled()) {
    return NextResponse.json({ enabled: false, metrics: null });
  }

  try {
    const metrics = await new SupabaseCommerceRepository().getSystemHealth();
    return NextResponse.json({ enabled: true, metrics });
  } catch (error) {
    console.error("Commerce v2 health query failed", { error });
    return NextResponse.json(
      { error: "System health is unavailable." },
      { status: 500 },
    );
  }
}
