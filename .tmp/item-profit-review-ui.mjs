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
        { id: "mv1", item_id: "it1", movement_date: "2026-04-01", quantity_delta: 1000, reason: "opening", note: "Opening stock", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-04-01T00:00:00Z", created_by: null },
        { id: "mv2", item_id: "it1", movement_date: "2026-09-15", quantity_delta: -222.974, reason: "sale", note: "", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-10-08T00:00:00Z", created_by: null },
        { id: "mv3", item_id: "it1", movement_date: "2026-09-16", quantity_delta: 3000, reason: "adjustment", note: "Count in", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-09-16T00:00:00Z", created_by: null },
        { id: "mv4", item_id: "it1", movement_date: "2026-09-17", quantity_delta: -3776.026, reason: "adjustment", note: "Count out", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-09-17T00:00:00Z", created_by: null },
        { id: "mv5", item_id: "it1", movement_date: "2026-09-18", quantity_delta: -1, reason: "delivery", note: "", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-09-18T00:00:00Z", created_by: null },
      ]),
    });
  }
  if (url.includes("/acc_voucher_item_lines")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "ln1", voucher_id: "sale-review", line_no: 1, item_id: "it1", item_name: "Basmati Rice 25kg", item_sku: "RICE25", item_type: "product", unit: "Bag", quantity: 200, rate: 1800, amount: 360000, discount_amount: 0, gst_rate: 5, hsn_sac: "1006", taxable_amount: 360000, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 },
      ]),
    });
  }
  return route.fallback();
});
await page.goto("http://127.0.0.1:4187/accounting/reports/item_profit", { waitUntil: "networkidle" });
const rice = page.getByRole("row", { name: /Basmati Rice/ });
await rice.getByRole("button", { name: "Open" }).click();
await page.getByRole("status").getByText("Requires review").waitFor();
const warnings = await page.locator(".acc-profit-review li").allTextContents();
if (warnings.length < 2) throw new Error(`expected review reasons, got ${warnings.join(" | ")}`);
const stock = page.locator(".acc-profit-fact", { hasText: "Current stock" });
const revenue = page.locator(".acc-profit-fact", { hasText: "Revenue" });
const stockValue = await stock.locator("strong").boundingBox();
const revenueLabel = await revenue.locator("span").boundingBox();
if (!stockValue || !revenueLabel) throw new Error("missing fact boxes");
if (stockValue.x + stockValue.width > revenueLabel.x - 8) throw new Error("stock value still collides with the revenue label");
const adjusted = await page.getByRole("row", { name: /Adjusted out/ }).innerText();
if (!/Adjusted out/.test(adjusted) || !/3,776/.test(adjusted)) throw new Error(`adjusted out row unreadable: ${adjusted}`);
await page.screenshot({ path: ".tmp/item-profit-review.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
const stockBox = await stock.boundingBox();
const revenueBox = await revenue.boundingBox();
if (revenueBox.y < stockBox.y + stockBox.height - 4) throw new Error("facts do not stack on a phone");
console.log("review layout ok");
await browser.close();
