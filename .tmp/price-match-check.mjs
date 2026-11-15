import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = "http://127.0.0.1:4175";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);

const PO = {
  id: "po1",
  doc_type: "purchase_order",
  doc_number: "PO-00001",
  doc_date: "2026-09-01",
  party_id: "p2",
  status: "open",
  reference: "",
  notes: "",
  terms: "",
  source_document_id: null,
  taxable_total: 15000,
  tax_total: 0,
  grand_total: 15000,
  stock_posted: false,
  cancel_reason: null,
  created_at: "2026-09-01T10:00:00Z",
};
const GRN = {
  id: "grn1",
  doc_type: "goods_receipt",
  doc_number: "GRN-00001",
  doc_date: "2026-09-03",
  party_id: "p2",
  status: "open",
  reference: "",
  notes: "",
  terms: "",
  source_document_id: "po1",
  taxable_total: 18000,
  tax_total: 0,
  grand_total: 18000,
  stock_posted: true,
  cancel_reason: null,
  created_at: "2026-09-03T10:00:00Z",
};
const PO_LINES = [{
  id: "pol1", document_id: "po1", line_no: 1, item_id: "it1", item_name: "Basmati Rice 25kg", item_sku: "RICE25",
  item_type: "product", unit: "Bag", quantity: 10, rate: 1500, amount: 15000, discount_amount: 0, gst_rate: 5,
  hsn_sac: "1006", taxable_amount: 15000, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, source_line_id: null,
}];
const GRN_LINES = [{
  id: "grnl1", document_id: "grn1", line_no: 1, item_id: "it1", item_name: "Basmati Rice 25kg", item_sku: "RICE25",
  item_type: "product", unit: "Bag", quantity: 12, rate: 1500, amount: 18000, discount_amount: 0, gst_rate: 5,
  hsn_sac: "1006", taxable_amount: 18000, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, source_line_id: "pol1",
}];

// Last registered route wins for overlapping patterns.
await page.route("**/rest/v1/**", async route => {
  const url = route.request().url();
  if (url.includes("/acc_trade_documents?")) {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([PO, GRN]) });
  }
  if (url.includes("/acc_trade_document_lines?")) {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...PO_LINES, ...GRN_LINES]) });
  }
  if (url.includes("/acc_price_lists?")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "pl1", name: "Dealer", kind: "selling", is_default: true, is_active: true, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }]),
    });
  }
  if (url.includes("/acc_price_list_rates?")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "r1", price_list_id: "pl1", item_id: "it1", rate: 1700 }]),
    });
  }
  if (url.includes("/acc_voucher_item_lines?")) {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "vil1", voucher_id: "v3", item_id: "it1", item_name: "Basmati Rice 25kg", item_sku: "RICE25",
        item_type: "product", unit: "Bag", quantity: 12, rate: 1600, discount_amount: 0, gst_rate: 5,
        hsn_sac: "1006", taxable_amount: 19200, cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
        source_document_line_id: "grnl1",
      }]),
    });
  }
  return route.fallback();
});

const waitCopy = async (needle, label) => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText();
    if (text.includes(needle)) return text;
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: `.tmp/${label}-fail.png` });
  throw new Error(`${label}: missing ${needle}\n${await page.locator("body").innerText()}`);
};

await page.goto(`${base}/accounting/documents/purchase_match`, { waitUntil: "domcontentloaded" });
await waitCopy("PO-00001", "po-match");
await waitCopy("Needs match", "po-match-status");
await page.getByRole("button", { name: "Open" }).first().click();
await waitCopy("Received more than ordered", "po-match-detail");
await page.screenshot({ path: ".tmp/po-match-check.png" });

await page.goto(`${base}/accounting/setup`, { waitUntil: "domcontentloaded" });
await waitCopy("Price lists", "setup-price");
await waitCopy("Show 1 lists", "setup-list-count");
await page.getByRole("button", { name: /Show 1 lists/i }).click();
await waitCopy("Dealer", "setup-dealer");
await page.screenshot({ path: ".tmp/price-lists-check.png" });

await page.goto(`${base}/accounting/reports/purchase_match`, { waitUntil: "domcontentloaded" });
await waitCopy("PO-00001", "report-match");

if (errors.length) throw new Error(errors.join("\n"));
console.log("price lists + po match ok");
await browser.close();
