import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SCOPE = "https://www.googleapis.com/auth/webmasters";

export async function discoverGoogleCredential(environment = process.env) {
  const candidates = [
    environment.WATCHDOG_GSC_CREDENTIALS_PATH,
    environment.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(environment.APPDATA ?? "", "gcloud", "application_default_credentials.json"),
    path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf8"));
      if (["authorized_user", "service_account"].includes(parsed.type)) return { path: candidate, credential: parsed };
    } catch {}
  }
  return null;
}

export async function getAccessToken(discovered, fetchImpl = fetch) {
  if (!discovered) return null;
  const credential = discovered.credential;
  if (credential.type === "authorized_user") {
    const response = await fetchImpl(credential.token_uri ?? "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: credential.client_id, client_secret: credential.client_secret, refresh_token: credential.refresh_token, grant_type: "refresh_token" }),
    });
    if (!response.ok) throw new Error(`Google OAuth refresh failed (${response.status}).`);
    return (await response.json()).access_token;
  }
  if (credential.type === "service_account") {
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = credential.token_uri ?? "https://oauth2.googleapis.com/token";
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({ iss: credential.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const assertion = `${header}.${payload}.${signer.sign(credential.private_key, "base64url")}`;
    const response = await fetchImpl(tokenUri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!response.ok) throw new Error(`Google service-account authorization failed (${response.status}).`);
    return (await response.json()).access_token;
  }
  return null;
}

export async function retrieveGscData({ accessToken, siteUrl, sitemapUrl, priorityUrls, fetchImpl = fetch }) {
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const sitemapEndpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const sitemapResponse = await fetchImpl(sitemapEndpoint, { headers });
  if (!sitemapResponse.ok) throw new Error(`Search Console sitemap retrieval failed (${sitemapResponse.status}).`);
  const rawSitemap = await sitemapResponse.json();
  const contents = Array.isArray(rawSitemap.contents) ? rawSitemap.contents : [];
  const sitemap = {
    lastSubmitted: rawSitemap.lastSubmitted ?? null,
    lastDownloaded: rawSitemap.lastDownloaded ?? null,
    isPending: Boolean(rawSitemap.isPending),
    warnings: Number(rawSitemap.warnings ?? 0),
    errors: Number(rawSitemap.errors ?? 0),
    submittedCount: sumCounts(contents, "submitted"),
    processedCount: sumCounts(contents, "indexed"),
  };
  const inspections = [];
  for (const url of priorityUrls) {
    const response = await fetchImpl("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers,
      body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: "en-US" }),
    });
    if (!response.ok) {
      inspections.push({ url, error: `URL Inspection failed (${response.status})`, indexed: null });
      continue;
    }
    const raw = await response.json();
    inspections.push(normalizeInspection(url, raw.inspectionResult?.indexStatusResult ?? {}));
  }
  return { sitemap, inspections };
}

export async function submitSitemap({ accessToken, siteUrl, sitemapUrl, fetchImpl = fetch }) {
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  const response = await fetchImpl(endpoint, { method: "PUT", headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Search Console sitemap submission failed (${response.status}).`);
}

function normalizeInspection(url, result) {
  const coverageState = result.coverageState ?? null;
  const verdict = result.verdict ?? "VERDICT_UNSPECIFIED";
  const indexed = verdict === "PASS" || /submitted and indexed|indexed/i.test(coverageState ?? "") && !/not indexed/i.test(coverageState ?? "");
  return {
    url,
    indexed,
    verdict,
    coverageState,
    robotsTxtState: result.robotsTxtState ?? null,
    indexingState: result.indexingState ?? null,
    pageFetchState: result.pageFetchState ?? null,
    lastCrawlTime: result.lastCrawlTime ?? null,
    googleCanonical: result.googleCanonical ?? null,
    userCanonical: result.userCanonical ?? null,
    referringUrls: Array.isArray(result.referringUrls) ? result.referringUrls : [],
    discoveredNeverCrawled: /discovered.*not currently indexed|discovered/i.test(coverageState ?? "") && !result.lastCrawlTime,
  };
}

function sumCounts(contents, key) {
  const values = contents.map((item) => Number(item[key])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function base64url(value) { return Buffer.from(value).toString("base64url"); }
