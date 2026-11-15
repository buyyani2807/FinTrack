// Capture-only check of the CA brief (never committed).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";
import { richRows, richRpc } from "./capture-data.mjs";

const base = "http://127.0.0.1:5175";
await mkdir(".tmp/site-check", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  const body = rpc ? richRpc(rpc[1]) : richRows(url);
  if (body === undefined) return route.fallback();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
await page.addInitScript(() => localStorage.setItem("fintrack-accounts-onboarding-v1:co1", "done"));
await page.goto(`${base}/accounting/ai-review`, { waitUntil: "domcontentloaded" });
await page.locator("h1").first().waitFor({ timeout: 60000 });
await page.locator("button.accounts-section-tab", { hasText: "Month-end" }).first().click();
await page.getByRole("button", { name: "Brief for the CA" }).click();
const sheet = page.locator(".ca-brief-sheet");
await sheet.waitFor();
const text = await sheet.innerText();
const needed = ["What changed", "What does not match", "Questions for the owner", "Nothing has been filed", "Trial balance"];
const missing = needed.filter(part => !text.includes(part));
await page.locator(".modal").screenshot({ path: ".tmp/site-check/ca-brief.png" });
await page.getByRole("button", { name: "Print" }).waitFor();
console.log(missing.length ? `missing: ${missing.join(", ")}` : "brief ok");
console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no page errors");
console.log(text.split("\n").slice(0, 18).join(" | "));
await browser.close();
