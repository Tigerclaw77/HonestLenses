// Real cart component and CSS; all auth/API calls are fixtures, never production.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/cart-empty-state.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = path.resolve("output/cart-empty-state");
await mkdir(out, { recursive: true });
const mocks = {
  "next/navigation": "export const useRouter = () => ({push: () => {}, replace: () => {}});",
  "next/link": "export default function Link({prefetch, ...props}) { return <a {...props}/>; }",
  "supabase-client": `const member = new URLSearchParams(location.search).get('member') === 'true';
    export const supabase = {auth:{
      getSession:async()=>({data:{session:member ? {access_token:'fixture-member'} : null}}),
      getUser:async()=>({data:{user:member ? {id:'fixture-user'} : null}}),
      onAuthStateChange:()=>({data:{listener:{subscription:{unsubscribe(){}}},subscription:{unsubscribe(){}}}})
    }};`,
  "@/lib/posthog/client": "export const POSTHOG_EVENTS={}; export const track=()=>{}; export const markStepStart=()=>{}; export const captureClientException=()=>{};",
  "@/lib/telemetry/funnel": "export const trackFunnelEvent=()=>{};",
  "@/components/AbandonmentFeedbackExperiment": "export default function Feedback(){return null;}",
  "@/components/conversion/ExitIntentSaveCart": "export default function ExitIntent(){return null;}",
};
await build({
  stdin: {
    contents: `import {createRoot} from 'react-dom/client'; import Cart from './src/app/cart/page';
      import './src/styles/globals.css'; import './src/styles/cart.css';
      createRoot(document.getElementById('root')).render(<Cart/>);`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  outfile: path.join(out, "app.js"), bundle: true, jsx: "automatic", external: ["/*.png"],
  define: { "process.env.NODE_ENV": '"production"', "process.env.VERCEL": '"1"' },
  plugins: [{name: "isolated-services", setup(b) {
    b.onResolve({filter: /.*/}, args => {
      const key = args.path.endsWith("/supabase-client") ? "supabase-client" : args.path;
      return mocks[key] ? {path: key, namespace: "mock"} : undefined;
    });
    b.onLoad({filter: /.*/, namespace: "mock"}, args => ({contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd()}));
  }}],
});
const server = createServer(async (req, res) => {
  if (req.url === "/app.js" || req.url === "/app.css") {
    res.setHeader("Content-Type", req.url.endsWith(".css") ? "text/css" : "application/javascript");
    res.end(await readFile(path.join(out, req.url.slice(1))));
  } else if (req.url === "/resume-order") {
    res.end("<!doctype html><title>Recovery route destination fixture</title>");
  } else {
    res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_CHANNEL ? {channel: process.env.BROWSER_CHANNEL} : {})});
try {
  for (const width of [1440, 390, 320]) {
    for (const member of [false, true]) {
      for (const scenario of ["empty", "active", "error"]) {
        const page = await browser.newPage({viewport: {width, height: 900}});
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
        await page.addInitScript(({scenario}) => {
          window.calls = [];
          const order = {id: "fixture-order", status: "draft", sku: "VITA_12", manufacturer: "Johnson & Johnson",
            rx: {expires: "2099-02-06", right: {coreId: "VITA", sphere: -2}, left: {coreId: "VITA", sphere: -2}},
            box_count: 2, total_box_count: 2, right_box_count: 1, left_box_count: 1,
            total_amount_cents: 20998, shipping_cents: 0, shipping_method: "standard"};
          window.fetch = async (url, options = {}) => {
            window.calls.push({url, options});
            if (url === "/api/cart" && scenario === "error") throw new Error("Fixture connection failure");
            let body;
            if (url === "/api/cart") body = {hasCart: scenario === "active", order: scenario === "active" ? order : null};
            else if (url === "/api/cart/resolve") body = {ok: true, order};
            else if (url === "/api/cart/has-items") body = {hasItems: scenario === "active"};
            else throw new Error(`Unexpected request: ${url}`);
            return {ok: true, json: async () => body};
          };
        }, {scenario});
        await page.goto(`${origin}/cart?member=${member}`);
        if (scenario === "active") {
          await page.getByRole("heading", {name: "Your Cart", exact: true}).waitFor();
          assert.equal(await page.getByRole("heading", {name: "No active cart found."}).count(), 0);
          assert.equal(await page.getByRole("link", {name: "Resume an order", exact: true}).count(), 0);
          assert.match(await page.locator("main").innerText(), /209\.98/);
          await page.waitForFunction(() => window.calls.some(c => c.url === "/api/cart/resolve"));
        } else if (scenario === "empty") {
          await page.getByRole("heading", {name: "No active cart found.", exact: true}).waitFor();
          assert.match(await page.locator("main").innerText(), /Started an order previously\? You can securely resume it using your email address\./);
          const link = page.getByRole("link", {name: "Resume an order", exact: true});
          assert.equal(await link.getAttribute("href"), "/resume-order");
          assert.ok((await link.boundingBox()).height >= 44);
          await link.focus();
          assert.equal(await link.evaluate(el => document.activeElement === el), true);
          await page.screenshot({path: path.join(out, `empty-${width}-${member ? "member" : "guest"}.png`), fullPage: true});
        } else {
          await page.getByText("Fixture connection failure", {exact: true}).waitFor();
          assert.equal(await page.getByRole("link", {name: "Resume an order", exact: true}).count(), 0);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${scenario} ${width}px overflow`);
        const calls = await page.evaluate(() => window.calls);
        for (const call of calls.filter(c => c.url === "/api/cart" || c.url === "/api/cart/resolve")) {
          assert.equal(call.options.headers.Authorization, member ? "Bearer fixture-member" : undefined);
        }
        assert.equal(calls.filter(c => c.url === "/api/cart/resolve").length, scenario === "active" ? 1 : 0);
        assert.deepEqual(errors, []);
        if (scenario === "empty") {
          await page.getByRole("link", {name: "Resume an order", exact: true}).press("Enter");
          await page.waitForURL(`${origin}/resume-order`);
        }
        await page.close();
        console.log(`PASS ${width}px ${member ? "signed-in" : "guest"} ${scenario}`);
      }
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
