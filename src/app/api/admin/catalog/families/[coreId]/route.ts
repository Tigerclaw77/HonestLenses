export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminAuthErrorResponse, requireAdminUser } from "@/lib/admin-auth";
import { listManagedCatalogFamilies, publishManagedCatalogFamily } from "@/lib/managedCatalog/repository";
import { validateManagedCatalogFamily } from "@/lib/managedCatalog/validation";
import type { ManagedCatalogFamilyInput } from "@/lib/managedCatalog/types";

export async function PUT(request: Request, context: { params: Promise<{ coreId: string }> }) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  const { coreId } = await context.params;
  let input: ManagedCatalogFamilyInput;
  try { input = await request.json() as ManagedCatalogFamilyInput; } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (input?.coreId !== coreId) return NextResponse.json({ error: "The URL and payload core IDs must match." }, { status: 400 });
  try {
    const existing = await listManagedCatalogFamilies();
    if (!existing.some((family) => family.coreId === coreId)) return NextResponse.json({ error: "Only managed catalog families can be edited here." }, { status: 404 });
    const issues = validateManagedCatalogFamily(input, { existingManagedCoreIds: existing.filter((family) => family.coreId !== coreId).map((family) => family.coreId) });
    if (issues.length) return NextResponse.json({ error: "Catalog family validation failed.", issues }, { status: 400 });
    const versionId = await publishManagedCatalogFamily(input);
    return NextResponse.json({ ok: true, versionId });
  } catch (error) {
    console.error("Unable to update managed catalog family", error);
    return NextResponse.json({ error: "Unable to update managed catalog family." }, { status: 503 });
  }
}
