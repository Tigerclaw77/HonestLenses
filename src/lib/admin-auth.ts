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
  role: string | null;
  error: string | null;
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

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "pauldriggers@aol.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.toLowerCase()));
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
}> {
  try {
    const supabaseAuth = await getSupabaseServerAuth();
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();

    return {
      user: error ? null : user,
      error: error?.message ?? null,
    };
  } catch (error) {
    return {
      user: null,
      error: error instanceof Error ? error.message : String(error),
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
  const bearer = await getBearerUser(req);
  const cookie = await getCookieUser();
  const candidates = uniqueCandidates([
    ...(bearer.user ? [{ source: "bearer" as const, user: bearer.user }] : []),
    ...(cookie.user ? [{ source: "cookie" as const, user: cookie.user }] : []),
  ]);

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
      reason: "No authenticated Supabase user resolved from bearer or cookies.",
      details: {
        hasBearer: bearer.hasBearer,
        bearerError: bearer.error,
        cookieError: cookie.error,
        host: req.headers.get("host"),
      },
    };
  }

  for (const candidate of candidates) {
    if (isAdminEmail(candidate.user.email)) {
      return {
        ok: true,
        user: candidate.user,
        authSource: candidate.source,
        adminSource: "email",
        profileRole: null,
      };
    }
  }

  const profileLookups = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      profile: await getProfileRole(candidate.user.id),
    })),
  );

  const profileAdmin = profileLookups.find(
    ({ profile }) => profile.role === "admin",
  );

  if (profileAdmin) {
    return {
      ok: true,
      user: profileAdmin.candidate.user,
      authSource: profileAdmin.candidate.source,
      adminSource: "profile",
      profileRole: profileAdmin.profile.role,
    };
  }

  return {
    ok: false,
    status: 403,
    error: "Forbidden",
    code: "ADMIN_REQUIRED",
    reason: "Authenticated user is not in the admin email allowlist and does not have profiles.role = admin.",
    details: {
      hasBearer: bearer.hasBearer,
      bearerError: bearer.error,
      cookieError: cookie.error,
      candidates: profileLookups.map(({ candidate, profile }) => ({
        authSource: candidate.source,
        userId: candidate.user.id,
        email: candidate.user.email ?? null,
        profileRole: profile.role,
        profileError: profile.error,
      })),
      host: req.headers.get("host"),
    },
  };
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
