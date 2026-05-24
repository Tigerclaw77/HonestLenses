import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseServerAuth } from "@/lib/supabase-server-auth";
import { supabaseServer } from "@/lib/supabase-server";

type AdminAuthSource = "bearer" | "cookie";
type AdminSource = "email" | "profile";

type AdminCandidate = {
  source: AdminAuthSource;
  user: User;
};

type ProfileLookup = {
  exists: boolean;
  role: string | null;
  error: string | null;
};

type AdminAuthDebugStep = {
  step: string;
  data: Record<string, unknown>;
};

export type AdminAuthSuccess = {
  ok: true;
  user: User;
  authSource: AdminAuthSource;
  adminSource: AdminSource;
  profileRole: string | null;
};

export type AdminAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: "Unauthorized" | "Forbidden";
  code: "AUTH_REQUIRED" | "ADMIN_REQUIRED";
  reason: string;
  details: Record<string, unknown>;
};

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim()
  ? process.env.ADMIN_EMAILS
  : "pauldriggers@aol.com";

const ADMIN_EMAILS = new Set(
  adminEmailsRaw
    .split(/[,\s;]+/)
    .map(normalizeEmail)
    .filter(Boolean),
);

function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizeRole(role?: string | null): string {
  return (role ?? "").trim().toLowerCase();
}

function isAdminEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && ADMIN_EMAILS.has(normalizedEmail));
}

function isAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === "admin";
}

function addDebugStep(
  steps: AdminAuthDebugStep[],
  step: string,
  data: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  steps.push({ step, data });
}

function logAdminAuthDecision(
  decision: "authorized" | "denied",
  steps: AdminAuthDebugStep[],
  result: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;

  console.warn("[admin auth] decision trace", {
    decision,
    result,
    steps,
  });
}

async function getBearerUser(req: Request): Promise<{
  user: User | null;
  error: string | null;
  hasBearer: boolean;
}> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { user: null, error: null, hasBearer: false };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    user: error ? null : user,
    error: error?.message ?? null,
    hasBearer: true,
  };
}

async function getCookieUser(): Promise<{
  user: User | null;
  error: string | null;
  hasSession: boolean;
  sessionEmail: string | null;
}> {
  try {
    const supabaseAuth = await getSupabaseServerAuth();
    const {
      data: { session },
      error: sessionError,
    } = await supabaseAuth.auth.getSession();
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();

    return {
      user: error ? null : user,
      error: error?.message ?? sessionError?.message ?? null,
      hasSession: Boolean(session),
      sessionEmail: session?.user.email ?? null,
    };
  } catch (error) {
    return {
      user: null,
      error: error instanceof Error ? error.message : String(error),
      hasSession: false,
      sessionEmail: null,
    };
  }
}

async function getProfileRole(userId: string): Promise<ProfileLookup> {
  const { data, error } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();

  return {
    exists: Boolean(data),
    role: data?.role ?? null,
    error: error?.message ?? null,
  };
}

function uniqueCandidates(candidates: AdminCandidate[]): AdminCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.user.id)) return false;
    seen.add(candidate.user.id);
    return true;
  });
}

export async function requireAdminUser(req: Request): Promise<AdminAuthResult> {
  const debugSteps: AdminAuthDebugStep[] = [];
  addDebugStep(debugSteps, "start", {
    host: req.headers.get("host"),
    adminEmailCount: ADMIN_EMAILS.size,
  });

  const bearer = await getBearerUser(req);
  addDebugStep(debugSteps, "bearer_auth", {
    hasBearer: bearer.hasBearer,
    hasUser: Boolean(bearer.user),
    userId: bearer.user?.id ?? null,
    email: bearer.user?.email ?? null,
    error: bearer.error,
  });

  const cookie = await getCookieUser();
  addDebugStep(debugSteps, "cookie_auth", {
    hasSession: cookie.hasSession,
    sessionEmail: cookie.sessionEmail,
    hasSessionUser: Boolean(cookie.user),
    userId: cookie.user?.id ?? null,
    email: cookie.user?.email ?? null,
    error: cookie.error,
  });

  const candidates = uniqueCandidates([
    ...(bearer.user ? [{ source: "bearer" as const, user: bearer.user }] : []),
    ...(cookie.user ? [{ source: "cookie" as const, user: cookie.user }] : []),
  ]);
  addDebugStep(debugSteps, "candidates", {
    count: candidates.length,
    candidates: candidates.map((candidate) => ({
      authSource: candidate.source,
      userId: candidate.user.id,
      email: candidate.user.email ?? null,
      normalizedEmail: normalizeEmail(candidate.user.email),
    })),
  });

  if (candidates.length === 0) {
    const failure: AdminAuthFailure = {
      ok: false,
      status: 401,
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      reason: "No authenticated Supabase user resolved from bearer or cookies.",
      details: {
        hasBearer: bearer.hasBearer,
        bearerError: bearer.error,
        cookieHasSession: cookie.hasSession,
        cookieError: cookie.error,
        host: req.headers.get("host"),
      },
    };
    logAdminAuthDecision("denied", debugSteps, {
      code: failure.code,
      reason: failure.reason,
    });
    return failure;
  }

  for (const candidate of candidates) {
    const emailMatched = isAdminEmail(candidate.user.email);
    addDebugStep(debugSteps, "email_allowlist_check", {
      authSource: candidate.source,
      userId: candidate.user.id,
      email: candidate.user.email ?? null,
      normalizedEmail: normalizeEmail(candidate.user.email),
      matched: emailMatched,
    });

    if (emailMatched) {
      const success: AdminAuthSuccess = {
        ok: true,
        user: candidate.user,
        authSource: candidate.source,
        adminSource: "email",
        profileRole: null,
      };
      logAdminAuthDecision("authorized", debugSteps, {
        authSource: success.authSource,
        adminSource: success.adminSource,
        email: success.user.email ?? null,
      });
      return success;
    }
  }

  const profileLookups = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      profile: await getProfileRole(candidate.user.id),
    })),
  );
  addDebugStep(debugSteps, "profile_role_lookup", {
    lookups: profileLookups.map(({ candidate, profile }) => ({
      authSource: candidate.source,
      userId: candidate.user.id,
      email: candidate.user.email ?? null,
      profileExists: profile.exists,
      profileRole: profile.role,
      normalizedProfileRole: normalizeRole(profile.role),
      profileError: profile.error,
      matched: isAdminRole(profile.role),
    })),
  });

  const profileAdmin = profileLookups.find(
    ({ profile }) => isAdminRole(profile.role),
  );

  if (profileAdmin) {
    const success: AdminAuthSuccess = {
      ok: true,
      user: profileAdmin.candidate.user,
      authSource: profileAdmin.candidate.source,
      adminSource: "profile",
      profileRole: profileAdmin.profile.role,
    };
    logAdminAuthDecision("authorized", debugSteps, {
      authSource: success.authSource,
      adminSource: success.adminSource,
      email: success.user.email ?? null,
      profileRole: success.profileRole,
    });
    return success;
  }

  const failure: AdminAuthFailure = {
    ok: false,
    status: 403,
    error: "Forbidden",
    code: "ADMIN_REQUIRED",
    reason: "Authenticated user is not in the admin email allowlist and does not have profiles.role = admin.",
    details: {
      hasBearer: bearer.hasBearer,
      bearerError: bearer.error,
      cookieHasSession: cookie.hasSession,
      cookieError: cookie.error,
      candidates: profileLookups.map(({ candidate, profile }) => ({
        authSource: candidate.source,
        userId: candidate.user.id,
        email: candidate.user.email ?? null,
        profileRole: profile.role,
        profileExists: profile.exists,
        profileError: profile.error,
      })),
      host: req.headers.get("host"),
    },
  };
  logAdminAuthDecision("denied", debugSteps, {
    code: failure.code,
    reason: failure.reason,
  });
  return failure;
}

export function logAdminAuthFailure(
  route: string,
  result: AdminAuthFailure,
): void {
  if (process.env.NODE_ENV === "production") return;

  console.warn("[admin auth] authorization failed", {
    route,
    status: result.status,
    code: result.code,
    reason: result.reason,
    ...result.details,
  });
}

export function adminAuthErrorResponse(result: AdminAuthFailure) {
  return NextResponse.json(
    {
      error: result.error,
      code: result.code,
    },
    { status: result.status },
  );
}
