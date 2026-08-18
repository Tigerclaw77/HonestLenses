export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminAuthErrorResponse, requireAdminUser } from "@/lib/admin-auth";
import { listManagedCatalogFamilies, publishManagedCatalogFamily } from "@/lib/managedCatalog/repository";
import { validateManagedCatalogFamily } from "@/lib/managedCatalog/validation";
import type { ManagedCatalogFamilyInput } from "@/lib/managedCatalog/types";

function isInput(value: unknown): value is ManagedCatalogFamilyInput {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  try {
    return NextResponse.json({ families: await listManagedCatalogFamilies() });
  } catch (error) {
    console.error("Unable to list managed catalog families", error);
    return NextResponse.json({ error: "Managed catalog storage is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request);
  if (!auth.ok) return adminAuthErrorResponse(auth);
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!isInput(input)) return NextResponse.json({ error: "Invalid catalog family payload." }, { status: 400 });
  try {
    const existing = await listManagedCatalogFamilies();
    const issues = validateManagedCatalogFamily(input, { existingManagedCoreIds: existing.map((family) => family.coreId) });
    if (issues.length) return NextResponse.json({ error: "Catalog family validation failed.", issues }, { status: 400 });
    const versionId = await publishManagedCatalogFamily(input);
    return NextResponse.json({ ok: true, versionId }, { status: 201 });
  } catch (error) {
    console.error("Unable to publish managed catalog family", error);
    return NextResponse.json({ error: "Unable to publish managed catalog family." }, { status: 503 });
  }
}
