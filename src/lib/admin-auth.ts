import { NextResponse } from "next/server";
import {
  requireAdmin,
  type AdminAuthFailure,
} from "@/lib/auth/authorization";

export type {
  AdminAuthFailure,
  AdminAuthResult,
  AdminAuthSuccess,
} from "@/lib/auth/authorization";

export const requireAdminUser = requireAdmin;

export function logAdminAuthFailure(
  route: string,
  result: AdminAuthFailure,
): void {
  console.warn("[admin auth] authorization denied", {
    route,
    status: result.status,
    code: result.code,
  });
}
export function adminAuthErrorResponse(result: AdminAuthFailure) {
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
}
