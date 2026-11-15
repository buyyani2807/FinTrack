import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4186/accounting/reports/item_profit", { waitUntil: "networkidle" });
await page.getByText("Basmati Rice 25kg").waitFor({ timeout: 15000 });
await page.getByText("Gross profit").first().waitFor();
await page.getByRole("button", { name: "Open" }).first().click();
await page.getByText("Where the quantity went").waitFor();
await page.getByText("Available stock").waitFor();
await page.getByText("Stock reconciliation").waitFor();
const review = await page.getByText("Stock movement requires review").count();
if (review) throw new Error("opening stock was flagged as unreconciled");
await page.getByRole("button", { name: "Back to items" }).click();
await page.goto("http://127.0.0.1:4186/accounting/inventory", { waitUntil: "networkidle" });
await page.getByText("Stock value (weighted average)").waitFor({ timeout: 15000 });
await page.getByText("Item profit").waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:4186/accounting/reports/item_profit", { waitUntil: "networkidle" });
await page.getByText("Basmati Rice 25kg").waitFor({ timeout: 15000 });
const overflow = await page.locator(".acc-profit-table").evaluate(node => node.scrollWidth > node.clientWidth + 2);
if (overflow) throw new Error("profit table overflows on a phone");
console.log("item profit ok");
await browser.close();
