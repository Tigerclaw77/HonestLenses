const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SessionDecision = "allow" | "deny";

function deniedSessionIds(): Set<string> | null {
  const configured = process.env.HL_DENIED_AUTH_SESSION_IDS?.trim();
  if (!configured) return null;

  const ids = configured.split(/[\s,;]+/).filter(Boolean);
  if (ids.some((id) => !UUID.test(id)) || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) {
    // A malformed active configuration must not silently drop a blocked ID.
    throw new Error("Invalid auth session denylist configuration");
  }
  return new Set(ids.map((id) => id.toLowerCase()));
}

function sessionIdFromVerifiedJwt(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const id = payload?.session_id;
    return typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Call only after Supabase auth.getUser(token) has verified this exact token. */
export function decideVerifiedAuthSession(token: string): SessionDecision {
  const denied = deniedSessionIds();
  if (!denied) return "allow";

  // With a denylist active, a valid user token without a session ID must not
  // become a way around the check. Supabase session JWTs include session_id.
  const sessionId = sessionIdFromVerifiedJwt(token);
  return sessionId && !denied.has(sessionId) ? "allow" : "deny";
}
