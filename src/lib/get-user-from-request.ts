import { supabaseServer } from "./supabase-server";

/**
 * Extracts and validates the authenticated user from an incoming Request.
 * Uses the Supabase service role to safely verify the JWT.
 *
 * Returns:
 *   - user object if valid
 *   - null if missing / invalid / expired
 */
export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseServer.auth.getUser(token);

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}
