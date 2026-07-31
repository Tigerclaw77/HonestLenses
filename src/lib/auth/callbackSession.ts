export type ImplicitAuthSession = {
  accessToken: string;
  refreshToken: string;
};

export function parseImplicitAuthSession(
  hash: string | null | undefined,
): ImplicitAuthSession | null {
  const value = hash?.startsWith("#") ? hash.slice(1) : hash;
  if (!value) return null;

  const params = new URLSearchParams(value);
  if (params.has("error")) return null;

  const accessToken = params.get("access_token")?.trim();
  const refreshToken = params.get("refresh_token")?.trim();
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
