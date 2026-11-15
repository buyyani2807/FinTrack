import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5178";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.route("**/acc_voucher_item_lines**", route => {
  console.log("served item lines");
  return route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([{
    id: "vil1",
    voucher_id: "v1",
    line_no: 1,
    item_id: "it1",
    item_name: "Basmati Rice 25kg",
    item_sku: "RICE25",
    item_type: "product",
    unit: "Bag",
    quantity: 2,
    rate: 1750,
    amount: 3500,
    gst_rate: 5,
    hsn_sac: "1006",
    taxable_amount: 3500,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
  }]),
});
});
await page.goto(`${base}/accounting`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "New", exact: true }).waitFor();
await page.getByRole("button", { name: "New", exact: true }).click({ force: true });
await page.getByRole("menuitem", { name: "Sale", exact: true }).click();
const sale = page.getByRole("dialog", { name: "Sale" });
await sale.waitFor();
await sale.getByRole("combobox", { name: "Customer" }).click();
await page.getByRole("option", { name: "Ravi Stores" }).click();
await sale.locator(".acc-table-wrap").getByRole("combobox").click();
await page.getByRole("option", { name: /Basmati Rice/ }).click();
const hint = sale.getByText(/Last sold to this customer/);
await hint.first().waitFor();
const hintText = await hint.first().innerText();
if (!hintText.includes("1,750") || !hintText.includes("Bag")) throw new Error(`Hint was:\n${hintText}`);
const rate = sale.locator(".acc-table-wrap tbody tr").first().locator("input").nth(1);
if ((await rate.inputValue()) === "1750") throw new Error("Rate was filled before Use this");
await sale.getByRole("button", { name: "Use this" }).first().click();
if ((await rate.inputValue()) !== "1750") throw new Error(`Rate after Use this: ${await rate.inputValue()}`);
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "New", exact: true }).click({ force: true });
await page.getByRole("menuitem", { name: "Purchase", exact: true }).click();
const purchase = page.getByRole("dialog", { name: "Purchase" });
await purchase.waitFor();
await purchase.locator(".acc-table-wrap").getByRole("combobox").click();
await page.getByRole("option", { name: /Basmati Rice/ }).click();
if (await purchase.getByText("Last sold").count()) throw new Error("Purchase shows a last sold price");

await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "New", exact: true }).click({ force: true });
await page.getByRole("menuitem", { name: "Sale", exact: true }).click();
const phone = page.getByRole("dialog", { name: "Sale" });
await phone.getByRole("combobox", { name: "Customer" }).click();
await page.getByRole("option", { name: "Ravi Stores" }).click();
await phone.locator(".acc-item-line-card").getByRole("combobox").click();
await page.getByRole("option", { name: /Basmati Rice/ }).click();
await phone.locator(".acc-item-line-card").getByText("Last sold to this customer").waitFor();
await phone.locator(".acc-item-line-card").getByRole("button", { name: "Use this" }).click();
const phoneRate = phone.locator(".acc-item-line-card input").nth(1);
if ((await phoneRate.inputValue()) !== "1750") throw new Error(`Phone rate: ${await phoneRate.inputValue()}`);

if (errors.length) throw new Error(errors.join("\n"));
console.log("last price ok");
await browser.close();
