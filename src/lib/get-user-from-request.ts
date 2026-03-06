import { createClient } from "@supabase/supabase-js";

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization");

  /* LOCAL DEV BYPASS */
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

  if (error || !user) return null;

  return user;
}