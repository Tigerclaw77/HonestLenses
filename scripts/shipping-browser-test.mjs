// Isolated browser test: real shipping component, mocked auth and HTTP only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const out = path.resolve("output/shipping-browser-test");
await mkdir(out, { recursive: true });

const mocks = {
  "next/navigation": "export const useRouter=()=>({push:p=>window.destination=p});",
  "next/link": "export default function Link({prefetch,...props}){return <a {...props}/>;}",
  "@/lib/supabase-client": `export const supabase={auth:{
    getSession:async()=>{const mode=new URLSearchParams(location.search).get('mode');return {data:{session:mode?.startsWith('stale-auth')?{access_token:'stale-token',user:{id:'fixture-user'}}:null}}},
    refreshSession:async()=>{const mode=new URLSearchParams(location.search).get('mode');return mode==='stale-auth-refresh'?{data:{session:{access_token:'fresh-token'}},error:null}:{data:{session:null},error:new Error('refresh unavailable')}}
  }};`,
  "@/lib/posthog/client": `export const POSTHOG_EVENTS={SHIPPING_VIEWED:'shipping_viewed',SHIPPING_FORM_STARTED:'shipping_form_started',SHIPPING_VALIDATION_FAILED:'shipping_validation_failed',SHIPPING_SAVE_SUCCEEDED:'shipping_save_succeeded',SHIPPING_SAVE_FAILED:'shipping_save_failed',CHECKOUT_STEP_TIMED:'checkout_step_timed',VALIDATION_ERROR:'validation_error'};
    export const track=(event,properties)=>window.events.push({event,properties});
    export const captureClientException=(error,properties)=>window.events.push({event:'exception',properties});
    export const consumeStepDurationMs=()=>1; export const markStepStart=()=>{};`,
};

await build({
  entryPoints: [path.resolve("scripts/shipping-browser-entry.tsx")],
  outfile: path.join(out, "app.js"), bundle: true, jsx: "automatic", external: ["/*.png"],
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-services", setup(buildApi) {
    buildApi.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
    buildApi.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
  } }],
});

const server = createServer(async (req, res) => {
  if (req.url === "/app.js" || req.url === "/app.css") {
    res.setHeader("Content-Type", req.url.endsWith(".css") ? "text/css" : "application/javascript");
    res.end(await readFile(path.join(out, req.url.slice(1))));
  } else {
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: "msedge" });

const init = () => {
  window.events = [];
  window.calls = [];
  window.fetch = async (url, options = {}) => {
    window.calls.push({
      url,
      options: {
        ...options,
        headers: Object.fromEntries(new Headers(options.headers).entries()),
      },
    });
    const params = new URLSearchParams(location.search);
    const mode = params.get("mode");
    if (url === "/api/cart") {
      if (mode === "network") throw new Error("Fixture network failure");
      const orderId = params.get("order") || "fixture-a";
      return { ok: true, json: async () => ({ hasCart: mode !== "empty", order: mode === "empty" ? null : {
        id: orderId, status: "draft", rx: { right: { sphere: -2 } }, sku: "FIXTURE", box_count: 2, total_amount_cents: 12000,
      } }) };
    }
    if (String(url).includes("/shipping")) {
      const authorization = new Headers(options.headers).get("authorization");
      if (mode === "stale-auth-refresh" && authorization === "Bearer stale-token") return { ok: false, status: 401 };
      if (mode === "stale-auth-guest" && authorization === "Bearer stale-token") return { ok: false, status: 401 };
      return { ok: mode !== "save-error", status: mode === "save-error" ? 400 : 200 };
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  };
};

async function pageFor(width, url = "/shipping") {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.addInitScript(init);
  await page.goto(origin + url);
  return page;
}

try {
  for (const width of [1440, 390]) {
    const page = await pageFor(width);
    await page.getByRole("button", { name: "Continue to Payment" }).waitFor();
    const expected = {
      "shipping-first-name": "shipping given-name",
      "shipping-last-name": "shipping family-name",
      "shipping-email": "shipping email",
      "shipping-phone": "shipping tel",
      "shipping-address1": "shipping address-line1",
      "shipping-address2": "shipping address-line2",
      "shipping-city": "shipping address-level2",
      "shipping-state": "shipping address-level1",
      "shipping-zip": "shipping postal-code",
    };
    for (const [id, value] of Object.entries(expected)) assert.equal(await page.locator(`#${id}`).getAttribute("autocomplete"), value);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const firstWidth = await page.locator("#shipping-first-name").evaluate(el => el.getBoundingClientRect().width);
    if (width === 390) assert.ok(firstWidth > 300, "mobile fields should be full width");
    else assert.ok(firstWidth > 300 && firstWidth < 700, "desktop columns should be preserved");
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText("Enter first name.").waitFor();
    assert.equal(await page.evaluate(() => window.events.filter(e => e.event === "shipping_validation_failed").length), 1);
    await page.locator("#shipping-first-name").fill("Fixture");
    await page.locator("#shipping-last-name").fill("Customer");
    await page.locator("#shipping-email").fill("invalid");
    assert.equal(await page.evaluate(() => window.events.filter(e => e.event === "shipping_form_started").length), 1);
    await page.reload();
    await page.locator("#shipping-first-name").waitFor();
    assert.equal(await page.locator("#shipping-first-name").inputValue(), "Fixture");
    assert.equal(await page.locator("#shipping-email").inputValue(), "invalid");
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.getByText("Enter a valid email.").waitFor();
    assert.equal(await page.evaluate(() => window.events.filter(e => e.event === "shipping_form_started").length), 0, "refresh must not repeat form-started");
    await page.locator("#shipping-email").fill("fixture@example.test");
    await page.locator("#shipping-address1").fill("123 Test St");
    await page.locator("#shipping-city").fill("Austin");
    await page.locator("#shipping-state").selectOption("TX");
    await page.locator("#shipping-zip").fill("78701");
    await page.getByRole("button", { name: "Continue to Payment" }).click();
    await page.waitForFunction(() => window.destination?.startsWith("/checkout?orderId="));
    const result = await page.evaluate(() => ({ events: window.events, calls: window.calls, draft: sessionStorage.getItem("hl_shipping_draft_v1") }));
    assert.equal(result.draft, null, "successful save clears browser draft");
    assert.equal(result.events.filter(e => e.event === "shipping_save_succeeded").length, 1);
    assert.equal(result.calls.filter(c => String(c.url).includes("/shipping") && c.options.method === "POST").length, 1);
    assert.doesNotMatch(JSON.stringify(result.events), /fixture@example\.test|123 Test St|Fixture Customer/);
    await page.close();
    console.log(`PASS shipping ${width}px form, refresh, validation, save`);
  }

  const scoped = await pageFor(390, "/shipping?order=first");
  await scoped.locator("#shipping-first-name").fill("Old Customer");
  await scoped.goto(origin + "/shipping?order=second");
  await scoped.locator("#shipping-first-name").waitFor();
  assert.equal(await scoped.locator("#shipping-first-name").inputValue(), "");
  assert.equal(await scoped.evaluate(() => sessionStorage.getItem("hl_shipping_draft_v1")), null);
  await scoped.close();
  console.log("PASS shipping order scope");

  const empty = await pageFor(390, "/shipping?mode=empty");
  await empty.getByText("No active cart found.").waitFor();
  assert.equal(await empty.getByRole("button", { name: "Continue to Payment" }).count(), 0);
  assert.equal(await empty.getByRole("link", { name: "Return to cart" }).getAttribute("href"), "/cart");
  await empty.close();
  console.log("PASS shipping no-cart recovery");

  const failed = await pageFor(390, "/shipping?mode=save-error");
  for (const [id, value] of Object.entries({
    "shipping-first-name": "Fixture", "shipping-last-name": "Customer", "shipping-email": "fixture@example.test",
    "shipping-address1": "123 Test St", "shipping-city": "Austin", "shipping-zip": "78701",
  })) await failed.locator(`#${id}`).fill(value);
  await failed.locator("#shipping-state").selectOption("TX");
  await failed.getByRole("button", { name: "Continue to Payment" }).click();
  await failed.getByText("Failed to save shipping.").waitFor();
  assert.equal(await failed.evaluate(() => window.events.find(e => e.event === "shipping_save_failed")?.properties.http_status), 400);
  assert.notEqual(await failed.evaluate(() => sessionStorage.getItem("hl_shipping_draft_v1")), null);
  await failed.close();
  console.log("PASS shipping failed save retains draft and status");

  for (const mode of ["stale-auth-refresh", "stale-auth-guest"]) {
    const recovered = await pageFor(390, `/shipping?mode=${mode}`);
    for (const [id, value] of Object.entries({
      "shipping-first-name": "Fixture", "shipping-last-name": "Customer", "shipping-email": "fixture@example.test",
      "shipping-address1": "123 Test St", "shipping-city": "Austin", "shipping-zip": "78701",
    })) await recovered.locator(`#${id}`).fill(value);
    await recovered.locator("#shipping-state").selectOption("TX");
    await recovered.getByRole("button", { name: "Continue to Payment" }).click();
    await recovered.waitForFunction(() => window.destination?.startsWith("/checkout?orderId="));
    const authorizationHeaders = await recovered.evaluate(() => window.calls
      .filter(call => String(call.url).includes("/shipping") && call.options.method === "POST")
      .map(call => call.options.headers.authorization ?? null));
    assert.deepEqual(
      authorizationHeaders,
      mode === "stale-auth-refresh"
        ? ["Bearer stale-token", "Bearer fresh-token"]
        : ["Bearer stale-token", null],
    );
    await recovered.close();
    console.log(`PASS shipping ${mode} recovery`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
