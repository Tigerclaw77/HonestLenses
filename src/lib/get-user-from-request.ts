import { createClient } from "@supabase/supabase-js";

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization");

  console.log("GET USER FROM REQUEST", {
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.slice(0, 20) ?? null,
    host: req.headers.get("host"),
  });

  if (
    process.env.NODE_ENV === "development" &&
    req.headers.get("host")?.includes("localhost")
  ) {
    return {
      id: "ef2cc991-f65f-4ce0-85ba-f5816ce2ee76",
      email: "dev@local.test",
    };
  }

  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "").trim();

  console.log("TOKEN CHECK", {
    hasToken: !!token,
    tokenPrefix: token.slice(0, 20),
  });

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

  console.log("SUPABASE AUTH RESULT", {
    hasUser: !!user,
    userId: user?.id ?? null,
    error: error?.message ?? null,
  });

  if (error || !user) return null;

  return user;
}