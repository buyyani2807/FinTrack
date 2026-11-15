import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  if (url.includes("/acc_stock_movements")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "mv-ca", item_id: "it1", movement_date: "2026-09-15", quantity_delta: -10000, reason: "adjustment", note: "Count", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-09-15T00:00:00Z", created_by: null },
      ]),
    });
  }
  return route.fallback();
});

const base = "http://127.0.0.1:4189";
await page.goto(`${base}/accounting/for-the-ca`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "E2E Traders" }).waitFor({ timeout: 15000 });
const text = await page.locator(".ca-pack").innerText();
for (const expected of ["Books", "Trial balance", "Opening stock", "Closing stock", "Invoices a GST check would reject", "Bank lines still unmatched", "RENT SEPT", "Stock rows that need review", "Basmati Rice"]) {
  if (!text.includes(expected)) throw new Error(`missing ${expected}\n${text}`);
}
if (text.includes("Brief for the CA")) throw new Error("old brief title is on the CA page");

await page.getByRole("row", { name: /RENT SEPT/ }).getByRole("button", { name: "Mark reviewed" }).click();
await page.getByRole("row", { name: /RENT SEPT/ }).getByText("Reviewed", { exact: true }).waitFor();

await page.getByRole("row", { name: /Basmati Rice/ }).getByRole("button", { name: "Open" }).click();
await page.getByRole("button", { name: "Back to items" }).waitFor({ timeout: 10000 });
if (!page.url().includes("/accounting/reports/item_profit")) throw new Error(page.url());

await page.goto(`${base}/accounting/ai-review`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Month-end" }).click();
await page.getByText("Month-end readiness").waitFor();
const monthEnd = await page.locator(".air").innerText();
if (monthEnd.includes("Brief for the CA")) throw new Error("brief button is still on month-end");

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${base}/accounting/for-the-ca`, { waitUntil: "networkidle" });
const pack = page.locator(".ca-pack");
await pack.getByText("RENT SEPT").waitFor();
const overflow = await pack.evaluate(node => node.scrollWidth > node.clientWidth + 2);
if (overflow) throw new Error("CA page overflows on a phone");
await pack.screenshot({ path: ".tmp/ca-pack-phone.png" });
await page.setViewportSize({ width: 1280, height: 900 });
await pack.screenshot({ path: ".tmp/ca-pack.png" });
console.log("ca pack ok");
await browser.close();
