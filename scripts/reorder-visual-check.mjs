import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const base = process.env.REORDER_VISUAL_BASE || "http://localhost:3107";
const out = path.resolve("output/reorder-visual-check");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("**/api/reorder/request", async route => {
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true }) });
    });
    await page.goto(`${base}/reorder/${"a".repeat(43)}`);
    await page.getByRole("heading", { name: "Reorder your contacts" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `entry-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Email my secure reorder link" }).click();
    await page.getByRole("status").waitFor();
    await page.goto(`${base}/reorder/accept?token=${"a".repeat(43)}`);
    await page.getByRole("heading", { name: "Continue your reorder" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `accept-${width}.png`), fullPage: true });
    await page.close();
  }
  console.log(`Reorder entry and acceptance layouts passed at 390, 768, 1440px; screenshots: ${out}`);
} finally {
  await browser.close();
}
