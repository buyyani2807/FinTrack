import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4185/accounting/overview", { waitUntil: "networkidle" });
await page.getByText("Opening stock", { exact: true }).first().waitFor({ timeout: 15000 });
await page.getByText("Closing stock", { exact: true }).first().waitFor();
const metrics = await page.locator(".acc-ov-metrics").innerText();
if (!/Net (profit|loss)/.test(metrics)) throw new Error(`missing result label: ${metrics}`);
if (/Net loss[\s\S]*₹\s*[-−]/.test(metrics)) throw new Error(`loss still shows a minus: ${metrics}`);
await page.goto("http://127.0.0.1:4185/accounting/reports/pnl", { waitUntil: "networkidle" });
await page.getByText("Opening stock", { exact: true }).waitFor({ timeout: 15000 });
await page.getByText("Closing stock", { exact: true }).waitFor();
const report = await page.locator(".acc-panel").innerText();
if (!/Profit before stock|Loss before stock/.test(report)) throw new Error("stock bridge missing");
if (/Net loss[\s\S]*₹\s*[-−]/.test(report)) throw new Error(`report loss still shows a minus: ${report}`);
console.log("pnl readability ok");
await browser.close();
