import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5191";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Accounts" }).waitFor({ timeout: 30000 });

async function display(selector) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return "missing";
  return el.evaluate(node => getComputedStyle(node).display);
}

if ((await display(".acc-places-side")) !== "missing") throw new Error("second sidebar is still rendered");
if ((await display(".acc-places-nav")) === "none") throw new Error("desktop tabs are hidden");
if ((await display(".acc-places-bar")) !== "none") throw new Error("phone bar is visible on desktop");
const home = page.locator(".acc-places-nav .module-section-tab", { hasText: "Home" });
const homeBox = await home.boundingBox();
if (!homeBox || homeBox.y > 220) throw new Error(`tabs are not under the title ${JSON.stringify(homeBox)}`);
await page.screenshot({ path: ".tmp/nav-places-desktop.png" });

await page.getByRole("button", { name: "Books", exact: true }).click();
await page.getByRole("button", { name: "Transactions" }).waitFor();
await page.screenshot({ path: ".tmp/nav-places-desktop-books.png" });

await page.setViewportSize({ width: 820, height: 1100 });
await page.waitForTimeout(200);
if ((await display(".acc-places-nav")) === "none") throw new Error("tablet tabs are hidden");
if ((await display(".acc-places-bar")) !== "none") throw new Error("phone bar is visible on tablet");
await page.screenshot({ path: ".tmp/nav-places-tablet.png" });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
if ((await display(".acc-places-primary")) !== "none") throw new Error("primary tabs still show on phone");
if ((await display(".acc-places-bar")) === "none") throw new Error("phone bar is missing");
await page.screenshot({ path: ".tmp/nav-places-phone.png" });

if (errors.length) throw new Error(errors.join("\n"));
console.log("nav places ok");
await browser.close();
