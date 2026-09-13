import { NextResponse } from "next/server";
import {
  requireAdmin,
  type AdminAuthFailure,
} from "@/lib/auth/authorization";

type AdminAuthFailureDiagnostic = {
  authorizationHeader?:
    | "missing"
    | "nonBearer"
    | "emptyBearer"
    | "bearer";
};

export type {
  AdminAuthFailure,
  AdminAuthResult,
  AdminAuthSuccess,
} from "@/lib/auth/authorization";

export const requireAdminUser = requireAdmin;

export function logAdminAuthFailure(
  route: string,
  result: AdminAuthFailure,
  diagnostic?: AdminAuthFailureDiagnostic,
): void {
  console.warn("[admin auth] authorization denied", {
    route,
    status: result.status,
    code: result.code,
    authHeader: diagnostic?.authorizationHeader,
  });
}
export function adminAuthErrorResponse(result: AdminAuthFailure) {
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status },
  );
}
