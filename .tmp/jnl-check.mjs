import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const coa = (id, code, name) => ({ code, name });
const vouchers = [
  { id: "v1", voucher_type: "sales", voucher_number: "S-1", voucher_date: "2026-09-10", narration: "Credit sale", status: "posted", party_id: "p1", source_module: null, source_type: null, source_transaction_id: null, cancel_reason: null, due_date: "2026-09-20", settlements: [], created_at: "2026-09-10T10:00:00Z", posted_at: "2026-09-10T10:00:00Z" },
  { id: "jnl", voucher_type: "journal", voucher_number: "JNL-000002", voucher_date: "2026-09-08", narration: "Opening balance", status: "posted", party_id: "p1", source_module: null, source_type: null, source_transaction_id: null, cancel_reason: null, due_date: "2026-09-15", settlements: [], created_at: "2026-09-08T10:00:00Z", posted_at: "2026-09-08T10:00:00Z" },
];
const lines = [
  { id: "l1", voucher_id: "v1", line_no: 1, coa_id: "debtors", party_id: "p1", debit: 12000, credit: 0, description: "", acc_coa: coa("debtors", "1100", "Sundry Debtors") },
  { id: "l2", voucher_id: "v1", line_no: 2, coa_id: "sales", party_id: null, debit: 0, credit: 12000, description: "", acc_coa: coa("sales", "4000", "Sales") },
  { id: "l3", voucher_id: "jnl", line_no: 1, coa_id: "debtors", party_id: "p1", debit: 290000, credit: 0, description: "", acc_coa: coa("debtors", "1100", "Sundry Debtors") },
  { id: "l4", voucher_id: "jnl", line_no: 2, coa_id: "sales", party_id: null, debit: 0, credit: 290000, description: "", acc_coa: coa("sales", "4000", "Sales") },
];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/acc_vouchers**", route => route.fulfill(json(vouchers)));
await page.route("**/rest/v1/acc_voucher_lines**", route => route.fulfill(json(lines)));
await page.goto("http://127.0.0.1:4184/accounting/reports/receivables", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "JNL-000002" }).click({ timeout: 15000 });
await page.getByRole("dialog", { name: "JOURNAL" }).waitFor();
await page.getByRole("button", { name: "Receive payment" }).click();
await page.getByRole("dialog", { name: "JOURNAL" }).waitFor({ state: "hidden" });
const amount = page.locator("input").filter({ hasNot: page.locator("[type=date]") }).first();
await page.getByText("Allocate against invoices").waitFor();
const allocated = await page.getByRole("row", { name: /JNL-000002/ }).getByPlaceholder("0").inputValue();
if (allocated !== "290000") throw new Error(`expected allocation 290000, got ${allocated}`);
console.log("journal receipt ok", await amount.inputValue().catch(() => ""));
await browser.close();
