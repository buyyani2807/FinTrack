import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const line = (id, documentId, name, unit, qty, rate, gst, hsn) => {
  const taxable = Math.round(qty * rate * 100) / 100;
  const tax = Math.round(taxable * gst) / 100;
  const half = Math.floor(tax * 100 / 2) / 100;
  return {
    id, document_id: documentId, line_no: 1, item_id: null, item_name: name, item_sku: "", item_type: "product",
    unit, quantity: qty, rate, amount: taxable, discount_amount: 0, gst_rate: gst, hsn_sac: hsn,
    taxable_amount: taxable, cgst_amount: half, sgst_amount: half, igst_amount: 0, source_line_id: null,
  };
};
const doc = (id, type, number, party, date, until, extra = {}) => ({
  id, doc_type: type, doc_number: number, doc_date: date, valid_until: until, party_id: party, status: "open",
  reference: "", notes: "", terms: "", source_document_id: null, stock_posted: false,
  taxable_total: 0, tax_total: 0, grand_total: 0, cancel_reason: "", created_at: `${date}T10:00:00Z`,
  ...extra,
});

const docs = [
  doc("d1", "quotation", "QT-00002", "p1", "2026-10-25", "2026-11-09", { notes: "Site delivery included.", terms: "Prices valid for 15 days. 50% advance." }),
  doc("d2", "sales_order", "SO-00002", "p1", "2026-10-02", "2026-10-09", { reference: "PO-18" }),
  doc("d3", "delivery_challan", "DC-00001", "p1", "2026-10-25", "", { source_document_id: "d2", notes: "Vehicle KA 01 AB 1000" }),
  doc("d4", "purchase_order", "PO-00004", "p2", "2026-10-20", "2026-10-27", { terms: "Deliver to the yard." }),
  doc("d5", "goods_receipt", "GRN-00003", "p2", "2026-10-24", ""),
];
const lines = [
  line("l1", "d1", "Burma Paper", "Kg", 1, 990, 18, "4810"),
  { ...line("l1b", "d1", "Burma Paper", "Kg", 1, 990, 18, "4810"), line_no: 2 },
  line("l2", "d2", "China Coat", "Litre", 100, 789, 18, "3208"),
  line("l3", "d3", "Burma Paper", "Kg", 1, 990, 18, "4810"),
  line("l4", "d4", "Primer", "Litre", 20, 450, 18, "3208"),
  line("l5", "d5", "Primer", "Litre", 20, 450, 18, "3208"),
];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
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
await page.route("**/rest/v1/acc_trade_documents**", route => route.fulfill(json(docs)));
await page.route("**/rest/v1/acc_trade_document_lines**", route => route.fulfill(json(lines)));

const shots = [
  ["quotation", "QT-00002", "quote"],
  ["sales_order", "SO-00002", "so"],
  ["delivery_challan", "DC-00001", "dc"],
  ["purchase_order", "PO-00004", "po"],
  ["goods_receipt", "GRN-00003", "grn"],
];
for (const [tab, number, name] of shots) {
  await page.goto(`http://127.0.0.1:4178/accounting/documents/${tab}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: number, exact: true }).click({ timeout: 15000 });
  const dialog = page.getByRole("dialog");
  await dialog.locator(".acc-sheet-number").waitFor();
  const bar = await dialog.locator(".acc-doc-viewer-actions").evaluate(node => {
    const controls = [...node.children].map(el => {
      const button = el.matches("button") ? el : el.querySelector("button");
      return {
        name: el.classList.contains("acc-doc-pdf-size") ? "PDF size" : (button?.textContent || "").replace(/\s+/g, " ").trim(),
        top: Math.round(el.getBoundingClientRect().top),
      };
    });
    const tops = controls.map(control => control.top);
    return { names: controls.map(control => control.name), spread: Math.max(...tops) - Math.min(...tops) };
  });
  if (bar.names.join(" | ") !== "PDF size | Download PDF | WhatsApp | Edit | Actions | Close") {
    throw new Error(`${number} action order ${bar.names.join(" | ")}`);
  }
  if (bar.spread > 2) throw new Error(`${number} actions are not on one line (${bar.spread}px)`);
  const kicker = await dialog.locator(".acc-sheet-kicker").first().innerText();
  const total = await dialog.locator(".acc-sheet-totals .is-total dd").innerText();
  if (!kicker || !total) throw new Error(`${number} sheet missing layout`);
  await dialog.locator(".acc-sheet").screenshot({ path: `.tmp/doc-sheet-${name}.png` });
  await dialog.locator("button.btn.primary", { hasText: "Close" }).click();
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:4178/accounting/documents/quotation", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "QT-00002", exact: true }).click();
await page.getByRole("dialog").locator(".acc-sheet").screenshot({ path: ".tmp/doc-sheet-mobile.png" });
console.log("sheets ok");
await browser.close();
