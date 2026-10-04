export const INDEXNOW_ORIGIN = "https://honestlenses.com";

const PUBLIC_PATHS = new Set([
  "/",
  "/about",
  "/browse",
  "/contact",
  "/contacts",
  "/guides",
  "/returns",
  "/verification",
  "/vision-benefits",
]);

export function isAllowedIndexNowUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.origin !== INDEXNOW_ORIGIN || url.username || url.password || url.search || url.hash) {
    return false;
  }

  return PUBLIC_PATHS.has(url.pathname)
    || /^\/contacts\/[a-z0-9-]+$/.test(url.pathname)
    || /^\/guides\/[a-z0-9-]+$/.test(url.pathname);
}

export function sitemapIndexNowUrls(xml) {
  return [...new Set(
    [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((match) => match[1])
      .filter(isAllowedIndexNowUrl),
  )];
}

export function isIndexableCanonicalResponse(url, response) {
  const normalizedUrl = new URL(url).href;
  if (response.status !== 200 || response.url !== normalizedUrl) return false;
  if (/\bnoindex\b/i.test(response.headers.get("x-robots-tag") ?? "")) return false;
  const html = response.body;
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1];
  const noindex = [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) =>
    /^(robots|googlebot)$/i.test(attribute(tag, "name") ?? "")
    && /\bnoindex\b/i.test(attribute(tag, "content") ?? ""));
  if (noindex) return false;
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => ({ rel: attribute(tag, "rel"), href: attribute(tag, "href") }))
    .find((link) => link.rel?.toLowerCase() === "canonical")?.href;
  try {
    return canonical ? new URL(canonical).href === normalizedUrl : false;
  } catch {
    return false;
  }
}
