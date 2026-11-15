import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
await mockAccountsWorkspace(page);

await page.goto(`${base}/daily-finance/users?account=fa2`, { waitUntil: "domcontentloaded" });
const card = page.locator(".credit-score-card");
await card.waitFor({ timeout: 20000 });
await card.evaluate(el => { el.style.maxWidth = "760px"; });
await page.waitForTimeout(200);
await card.screenshot({ path: "public/product/credit.png" });
console.log("saved credit");

await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 4000))]);
process.exit(0);
