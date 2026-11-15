import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);

await page.route("**/rest/v1/**", async route => {
  const url = route.request().url();
  if (url.includes("/acc_stock_movements")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "mv-open",
          item_id: "it1",
          movement_date: "2026-04-01",
          quantity_delta: 40,
          reason: "opening",
          note: "",
          voucher_id: null,
          voucher_item_line_id: null,
          voucher_number: "",
          created_at: "2026-04-01T00:00:00Z",
          created_by: "e2e-user",
        },
        {
          id: "mv-sale",
          item_id: "it1",
          movement_date: "2026-09-20",
          quantity_delta: -5,
          reason: "sale",
          note: "",
          voucher_id: "v1",
          voucher_item_line_id: "vil1",
          voucher_number: "S-1",
          created_at: "2026-09-28T10:00:00Z",
          created_by: "e2e-user",
        },
      ]),
    });
  }
  if (url.includes("/acc_voucher_item_lines")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "vil1",
          voucher_id: "v1",
          item_id: "it1",
          line_no: 1,
          quantity: 5,
          rate: 1800,
          amount: 9000,
          discount_amount: 0,
          taxable_amount: 9000,
          gst_rate: 5,
          cgst_amount: 225,
          sgst_amount: 225,
          igst_amount: 0,
          hsn_sac: "1006",
          unit: "Bag",
        },
      ]),
    });
  }
  if (url.includes("/ai_review_actions")) {
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  }
  return route.fallback();
});

let saved = null;
await page.route("**/rest/v1/rpc/ai_record_review_action", async route => {
  saved = JSON.parse(route.request().postData() || "{}");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "rev1" }),
  });
});

await page.goto("http://127.0.0.1:4196/accounting/reports/item_profit", { waitUntil: "networkidle" });
await page.getByText("Basmati Rice 25kg").first().waitFor({ timeout: 15000 });
await page.getByRole("row", { name: /Basmati Rice 25kg/ }).getByRole("button", { name: "Open" }).click();
await page.locator(".acc-item-profit-detail").waitFor();
const banner = page.locator(".acc-profit-review");
await banner.getByText("Requires review").waitFor();
if (!(await banner.innerText()).includes("recorded on")) throw new Error(await banner.innerText());
await banner.getByRole("button", { name: "Mark reviewed" }).click();
await banner.getByText("Reviewed", { exact: true }).waitFor({ timeout: 10000 });
if (saved?.input_feature !== "inventory") throw new Error(`feature ${saved?.input_feature}`);
if (!String(saved?.input_insight_key || "").startsWith("ip:")) throw new Error(String(saved?.input_insight_key));
if (await banner.getByRole("button", { name: "Mark reviewed" }).count()) throw new Error("button still shown");

await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => {
  const node = document.querySelector(".acc-profit-review");
  return node && node.scrollWidth > node.clientWidth + 2;
});
if (overflow) throw new Error("review banner overflow");

await page.getByRole("button", { name: "Back to items" }).click();
await page.getByRole("row", { name: /Basmati Rice 25kg/ }).getByText("Reviewed", { exact: true }).waitFor();
if (await page.getByRole("row", { name: /Basmati Rice 25kg/ }).getByText("Requires review").count()) {
  throw new Error("Requires review still on list");
}
console.log("item profit mark reviewed ok");
await browser.close();
