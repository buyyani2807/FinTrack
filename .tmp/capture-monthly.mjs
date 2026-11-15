import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
await mockAccountsWorkspace(page);
await page.goto(`${base}/monthly-finance`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Monthly Finance", exact: true }).waitFor({ timeout: 20000 });
await page.getByText("Meena Traders").first().waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: "public/product/monthly.png" });
console.log("saved monthly");
await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 4000))]);
process.exit(0);
