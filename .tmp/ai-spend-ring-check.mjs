import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const coa = (id, code, name, group_type, account_type) => ({
  id, code, name, group_type, account_type, is_system: true, is_active: true, opening_balance: 0,
  opening_side: group_type === "asset" || group_type === "expense" ? "dr" : "cr", parent_id: null,
});
const COA = [
  coa("cash", "1000", "Cash", "asset", "cash"),
  coa("bank", "1010", "HDFC Bank", "asset", "bank"),
  coa("debtors", "1100", "Sundry Debtors", "asset", "receivable"),
  coa("creditors", "2000", "Sundry Creditors", "liability", "payable"),
  coa("capital", "3000", "Capital", "equity", "capital"),
  coa("sales", "4000", "Sales", "income", "sales"),
  coa("purchases", "5000", "Purchases", "expense", "purchase"),
  coa("rent", "5100", "Rent", "expense", "expense"),
  coa("salary", "5200", "Salary", "expense", "expense"),
  coa("power", "5300", "Electricity", "expense", "expense"),
];
const ref = id => ({ code: COA.find(row => row.id === id).code, name: COA.find(row => row.id === id).name });
const voucher = (id, voucher_type, voucher_number, voucher_date, party_id, narration) => ({
  id, voucher_type, voucher_number, voucher_date, narration, status: "posted", party_id, source_module: null, source_type: null,
  source_transaction_id: null, cancel_reason: null, due_date: null, settlements: [], created_at: `${voucher_date}T10:00:00Z`, posted_at: `${voucher_date}T10:00:00Z`,
});
const VOUCHERS = [
  voucher("v1", "sales", "S-1", "2026-09-10", "p1", "Credit sale"),
  voucher("v3", "purchase", "P-1", "2026-09-05", "p2", "Stock purchase"),
  voucher("vr1", "payment", "PY-A", "2026-08-10", null, "Shop rent"),
  voucher("vs1", "payment", "PY-B", "2026-08-10", null, "Salary"),
  voucher("ve1", "payment", "PY-C", "2026-08-10", null, "Electricity"),
  voucher("vr2", "payment", "PY-D", "2026-09-10", null, "Shop rent"),
  voucher("vs2", "payment", "PY-E", "2026-09-10", null, "Salary"),
  voucher("ve2", "payment", "PY-F", "2026-09-10", null, "Electricity"),
];
let n = 0;
const line = (voucher_id, coa_id, debit, credit) => ({
  id: `l${++n}`, voucher_id, line_no: n, coa_id, party_id: null, debit, credit, description: "", acc_coa: ref(coa_id),
});
const LINES = [
  line("v1", "debtors", 12000, 0), line("v1", "sales", 0, 12000),
  line("v3", "purchases", 8000, 0), line("v3", "creditors", 0, 8000),
  line("vr1", "rent", 10000, 0), line("vr1", "bank", 0, 10000),
  line("vs1", "salary", 20000, 0), line("vs1", "bank", 0, 20000),
  line("ve1", "power", 2000, 0), line("ve1", "bank", 0, 2000),
  line("vr2", "rent", 35000, 0), line("vr2", "bank", 0, 35000),
  line("vs2", "salary", 65000, 0), line("vs2", "bank", 0, 65000),
  line("ve2", "power", 8000, 0), line("ve2", "bank", 0, 8000),
];

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  if (url.includes("/acc_coa?")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(COA) });
  if (url.includes("/acc_vouchers?")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VOUCHERS) });
  if (url.includes("/acc_voucher_lines?")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LINES) });
  return route.fallback();
});

const base = "http://127.0.0.1:4188";
await page.goto(`${base}/accounting/ai-review`, { waitUntil: "networkidle" });
const spend = page.getByRole("region", { name: "Spend by category" });
await spend.waitFor({ timeout: 15000 });
const text = await spend.innerText();
for (const expected of ["Spend by category", "Salary", "Rent", "Electricity", "this period", "60%", "32%", "7%"]) {
  if (!text.includes(expected)) throw new Error(`missing ${expected}\n${text}`);
}
if (text.includes("Spending analysis") || text.includes("Purchases") || text.includes("Stock purchases")) {
  throw new Error(`review chart still shows the expense mix\n${text}`);
}
const circles = await spend.locator("circle").count();
if (circles !== 4) throw new Error(`expected a track and 3 slices, got ${circles}`);
const pageText = await page.locator(".air").innerText();
if (pageText.includes("Spending analysis")) throw new Error("Spending analysis is still on AI Review");

const ring = await spend.locator("svg").boundingBox();
const legend = await spend.locator(".acc-ov-spend-legend").boundingBox();
if (!ring || !legend || legend.x < ring.x + ring.width - 8) throw new Error(`legend is not beside the ring ${JSON.stringify({ ring, legend })}`);

const salary = page.getByRole("button", { name: /Salary/ });
await salary.click();
if (await salary.getAttribute("aria-expanded") !== "true") throw new Error("salary row did not open");
await page.locator(".air-pick-item.is-open").getByText("Suggested action").waitFor();

await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(200);
const ringPhone = await spend.locator("svg").boundingBox();
const legendPhone = await spend.locator(".acc-ov-spend-legend").boundingBox();
if (!ringPhone || !legendPhone || legendPhone.y < ringPhone.y + ringPhone.height - 8) {
  throw new Error(`legend is not below the ring on a phone ${JSON.stringify({ ringPhone, legendPhone })}`);
}
await spend.screenshot({ path: ".tmp/ai-spend-ring-phone.png" });

await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${base}/accounting/overview`, { waitUntil: "networkidle" });
const analysis = page.getByRole("region", { name: "Spending analysis" });
await analysis.waitFor({ timeout: 15000 });
const overview = await analysis.innerText();
if (!overview.includes("Spending analysis") || !overview.includes("Rent")) throw new Error(overview);
await spend.screenshot({ path: ".tmp/ai-spend-ring.png" }).catch(() => {});
await page.goto(`${base}/accounting/ai-review`, { waitUntil: "networkidle" });
await page.getByRole("region", { name: "Spend by category" }).screenshot({ path: ".tmp/ai-spend-ring.png" });
console.log("spend ring ok");
await browser.close();
