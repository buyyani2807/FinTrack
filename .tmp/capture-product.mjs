import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = "http://127.0.0.1:5175";
const out = "public/product";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
await mockAccountsWorkspace(page);

async function open(path, heading) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
}

await open("/dashboard", "Dashboard");
await page.screenshot({ path: `${out}/dashboard.png` });
console.log("saved dashboard");

await open("/daily-finance", "Daily Finance");
await page.screenshot({ path: `${out}/finance.png` });
console.log("saved finance");

await open("/monthly-finance", "Monthly Finance");
await page.getByText("Meena Traders").first().waitFor({ timeout: 15000 });
await page.locator("h2", { hasText: "Monthly finance" }).evaluate(el => {
  const top = el.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo(0, Math.max(0, top));
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/monthly.png` });
console.log("saved monthly");

await open("/chit-fund/schemes", "Chit Fund");
await page.getByText("Morning Auction").first().waitFor({ timeout: 15000 });
await page.getByText("Morning Auction").first().evaluate(el => el.scrollIntoView({ block: "center" }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/chit.png` });
console.log("saved chit");

await open("/accounting", "Accounts");
await page.getByRole("button", { name: "Transactions", exact: true }).click();
await page.getByText("S-1").first().waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/accounts.png` });
console.log("saved accounts");

await open("/dashboard", "Dashboard");
const ask = page.getByRole("button", { name: /Ask Finny/i }).first();
await ask.waitFor({ timeout: 15000 });
await ask.click();
await page.getByRole("dialog").waitFor({ timeout: 10000 });
await page.getByRole("button", { name: "Who has not paid today?" }).click();
await page.locator(".ft-ask-answer").waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/intelligence.png` });
console.log("saved intelligence");

const login = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
const loginPage = await login.newPage();
await loginPage.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
await loginPage.getByRole("button", { name: "Owner sign in" }).waitFor({ timeout: 20000 });
await loginPage.locator(".ft-auth-panel").screenshot({ path: `${out}/portals.png` });
console.log("saved portals");
await login.close();

await Promise.race([
  browser.close(),
  new Promise(resolve => setTimeout(resolve, 4000)),
]);
console.log("done");
process.exit(0);
