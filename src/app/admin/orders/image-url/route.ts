import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/get-user-from-request";
import { getSupabaseServerAuth } from "@/lib/supabase-server-auth";
import { supabaseServer } from "@/lib/supabase-server";

const ADMIN_EMAILS = ["pauldriggers@aol.com"];

type AuthUser = {
  id: string;
  email?: string | null;
};

type AuthResult =
  | {
      ok: true;
      user: AuthUser;
      source: "bearer" | "cookie";
      adminSource: "email" | "profile";
    }
  | {
      ok: false;
      status: 401 | 403;
      code: string;
      message: string;
      details: Record<string, unknown>;
    };

function logAuthFailure(result: Extract<AuthResult, { ok: false }>) {
  if (process.env.NODE_ENV === "production") return;

  console.warn("[admin rx image] auth failed", {
    code: result.code,
    status: result.status,
    ...result.details,
  });
}

async function getCookieUser(): Promise<AuthUser | null> {
  try {
    const supabaseAuth = await getSupabaseServerAuth();
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();

    if (error || !user) return null;
    return user;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin rx image] cookie auth lookup failed", error);
    }
    return null;
  }
}

async function authorizeAdmin(req: Request): Promise<AuthResult> {
  const hasBearer = Boolean(req.headers.get("authorization"));
  const bearerUser = await getUserFromRequest(req);
  const cookieUser = bearerUser ? null : await getCookieUser();
  const user = bearerUser ?? cookieUser;
  const source = bearerUser ? "bearer" : "cookie";

  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "not_authenticated",
      message: "Admin session is required.",
      details: {
        hasBearer,
        hasCookieFallback: Boolean(cookieUser),
        host: req.headers.get("host"),
      },
    };
  }

  if (ADMIN_EMAILS.includes(user.email ?? "")) {
    return { ok: true, user, source, adminSource: "email" };
  }

  const { data: profile, error: profileError } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (!profileError && profile?.role === "admin") {
    return { ok: true, user, source, adminSource: "profile" };
  }

  return {
    ok: false,
    status: 403,
    code: "not_admin",
    message: "Admin access is required.",
    details: {
      userId: user.id,
      email: user.email ?? null,
      authSource: source,
      profileRole: profile?.role ?? null,
      profileError: profileError?.message ?? null,
    },
  };
}

export async function POST(req: Request) {
  const auth = await authorizeAdmin(req);
  if (!auth.ok) {
    logAuthFailure(auth);
    return NextResponse.json(
      { error: auth.message, code: auth.code },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { path?: unknown };
  const path = body.path;

  if (typeof path !== "string" || !path) {
    return NextResponse.json(
      { error: "Missing path", code: "missing_path" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseServer.storage
    .from("prescriptions")
    .createSignedUrl(path, 60);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[admin rx image] signed URL generation failed", {
        path,
        userId: auth.user.id,
        authSource: auth.source,
        adminSource: auth.adminSource,
        error: error.message,
      });
    }

    return NextResponse.json(
      { error: error.message, code: "signed_url_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
