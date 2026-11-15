import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/rpc/acc_list_companies**", route => route.fulfill(json([{
  id: "co1", name: "E2E Traders", is_primary: true, books_started_on: "2026-04-01", fy_start_month: 4, status: "active",
  gst_registration: "regular", gstin: "29AAAAA0000A1Z5", legal_name: "E2E Traders Pvt Ltd", state_code: "29", state_name: "Karnataka",
}])));
await page.route("**/rest/v1/acc_document_settings**", route => route.fulfill(json([{
  business_address: "12 MG Road, Bengaluru", business_phone: "08040001000", business_email: "books@example.com",
  logo_data_url: "", upi_id: "", upi_payee_name: "", bank_name: "HDFC Bank", bank_account_number: "1234567890",
  bank_ifsc: "HDFC0000123", invoice_template: "a4", show_upi_qr: false, invoice_terms: "", quotation_terms: "",
  credit_control: "warn", overdue_block_days: 0,
}])));
await page.route("**/rest/v1/acc_voucher_lines**", route => route.fulfill(json([
  { id: "l1", voucher_id: "v1", line_no: 1, coa_id: "debtors", party_id: "p1", debit: 61500, credit: 0, description: "", acc_coa: { code: "1100", name: "Sundry Debtors" } },
  { id: "l2", voucher_id: "v1", line_no: 2, coa_id: "sales", party_id: null, debit: 0, credit: 61500, description: "", acc_coa: { code: "4000", name: "Sales" } },
  { id: "l3", voucher_id: "v2", line_no: 1, coa_id: "cash", party_id: null, debit: 4000, credit: 0, description: "", acc_coa: { code: "1000", name: "Cash" } },
  { id: "l4", voucher_id: "v2", line_no: 2, coa_id: "debtors", party_id: "p1", debit: 0, credit: 4000, description: "", acc_coa: { code: "1100", name: "Sundry Debtors" } },
  { id: "l5", voucher_id: "v3", line_no: 1, coa_id: "purchases", party_id: null, debit: 8000, credit: 0, description: "", acc_coa: { code: "5000", name: "Purchases" } },
  { id: "l6", voucher_id: "v3", line_no: 2, coa_id: "creditors", party_id: "p2", debit: 0, credit: 8000, description: "", acc_coa: { code: "2000", name: "Sundry Creditors" } },
  { id: "l7", voucher_id: "v4", line_no: 1, coa_id: "rent", party_id: null, debit: 3000, credit: 0, description: "", acc_coa: { code: "5100", name: "Rent" } },
  { id: "l8", voucher_id: "v4", line_no: 2, coa_id: "bank", party_id: null, debit: 0, credit: 3000, description: "", acc_coa: { code: "1010", name: "HDFC Bank" } },
])));
await page.route("**/rest/v1/acc_gst_lines**", route => route.fulfill(json([
  { id: "g1", voucher_id: "v1", line_no: 1, hsn_sac: "320901090", description: "", taxable_amount: 52118.58, rate: 18, cgst_amount: 4690.67, sgst_amount: 4690.67, igst_amount: 0, supply_type: "intra", itc_eligible: true },
])));
await page.route("**/rest/v1/acc_voucher_item_lines**", route => route.fulfill(json([
  { id: "i1", voucher_id: "v1", line_no: 1, item_id: null, item_name: "Cement Primer", item_sku: "PR", item_type: "product", unit: "NOS", quantity: 15, rate: 2542.37, amount: 38135.55, discount_amount: 0, gst_rate: 18, hsn_sac: "320901090", taxable_amount: 38135.55, cgst_amount: 3432.2, sgst_amount: 3432.2, igst_amount: 0 },
  { id: "i2", voucher_id: "v1", line_no: 2, item_id: null, item_name: "Interior Cp", item_sku: "", item_type: "product", unit: "NOS", quantity: 5, rate: 2288.13, amount: 11440.65, discount_amount: 0, gst_rate: 18, hsn_sac: "320901090", taxable_amount: 11440.65, cgst_amount: 1029.66, sgst_amount: 1029.66, igst_amount: 0 },
  { id: "i3", voucher_id: "v1", line_no: 3, item_id: null, item_name: "Micro Concrete", item_sku: "", item_type: "product", unit: "NOS", quantity: 3, rate: 847.46, amount: 2542.38, discount_amount: 0, gst_rate: 18, hsn_sac: "32141000", taxable_amount: 2542.38, cgst_amount: 228.81, sgst_amount: 228.81, igst_amount: 0 },
])));

await page.goto("http://127.0.0.1:4182/accounting/parties/receivables", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "S-1", exact: true }).click({ timeout: 15000 });
const dialog = page.getByRole("dialog", { name: "TAX INVOICE" });
await dialog.locator(".acc-tax-invoice").waitFor();
const text = await dialog.locator(".acc-tax-invoice").innerText();
for (const phrase of ["TAX INVOICE", "BILL TO", "HSN/SAC", "Cement Primer", "23 NOS", "Round off", "Amount chargeable", "Tax amount", "Declaration", "Authorised Signatory", "E. & O.E.", "computer generated invoice"]) {
  if (!text.toLowerCase().includes(phrase.toLowerCase())) {
    console.log(text);
    throw new Error(`missing ${phrase}`);
  }
}
const borders = await dialog.locator(".acc-tax-meta").evaluate(node => {
  const style = getComputedStyle(node);
  return { top: style.borderTopWidth, color: style.borderTopColor };
});
if (borders.top !== "1px") throw new Error(`meta rule ${borders.top}`);
await dialog.locator(".acc-tax-invoice").screenshot({ path: ".tmp/tax-invoice.png" });
await dialog.locator(".acc-tax-words").first().screenshot({ path: ".tmp/tax-invoice-words.png" });
await dialog.locator(".acc-tax-bottom").screenshot({ path: ".tmp/tax-invoice-sign.png" });
await page.setViewportSize({ width: 390, height: 844 });
await dialog.locator(".acc-tax-head").screenshot({ path: ".tmp/tax-invoice-mobile.png" });
console.log("tax invoice ok");
await browser.close();
