"use client";

import { supabase } from "@/lib/supabase-client";

function withAccessToken(
  init: RequestInit,
  accessToken: string | null,
): RequestInit {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else headers.delete("Authorization");

  return {
    ...init,
    credentials: init.credentials ?? "same-origin",
    headers,
  };
}

/**
 * Retries a same-origin order request after a stale Supabase bearer token.
 *
 * The server continues to reject invalid explicit credentials. If refreshing
 * the session fails, the final credential-free retry can only succeed when the
 * browser already holds the signed, HttpOnly capability for this exact guest
 * order.
 */
export async function fetchWithOrderAccess(
  input: RequestInfo | URL,
  init: RequestInit = {},
  accessToken: string | null = null,
): Promise<Response> {
  let response = await fetch(input, withAccessToken(init, accessToken));
  if (response.status !== 401 || !accessToken) return response;

  let refreshedToken: string | null = null;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    refreshedToken = error ? null : data.session?.access_token ?? null;
  } catch {
    // The signed guest-order capability remains available for the final retry.
  }

  if (refreshedToken && refreshedToken !== accessToken) {
    response = await fetch(input, withAccessToken(init, refreshedToken));
    if (response.status !== 401) return response;
  }

  return fetch(input, withAccessToken(init, null));
}
