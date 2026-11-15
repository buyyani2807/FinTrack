import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4180/accounting/ai-review", { waitUntil: "networkidle" });
const card = page.getByRole("region", { name: "Spending analysis" });
await card.waitFor({ timeout: 15000 });
const text = await card.innerText();
if (!text.includes("Spending analysis") || !text.includes("Rent") || !text.includes("Open P&L")) {
  throw new Error(text);
}
await card.screenshot({ path: ".tmp/ai-spend.png" });
console.log("ok");
await browser.close();
