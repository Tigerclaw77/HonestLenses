export function getTrustedSiteOrigin(): string {
  const configured = process.env.SITE_URL?.trim();
  if (!configured) throw new Error("SITE_URL is required");

  const url = new URL(configured);
  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error("SITE_URL must use HTTPS outside local development");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("SITE_URL must be an origin without credentials or a path");
  }
  return url.origin;
}
