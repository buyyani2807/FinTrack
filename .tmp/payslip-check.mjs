import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5177";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Payslip" }).click();
const slip = page.locator(".pay-slip");
await slip.waitFor();
const text = await slip.innerText();
for (const bit of ["E2E Traders", "PAYSLIP", "September 2026", "Anita Rao", "Earnings", "Deductions", "Gross earnings", "Total deductions", "NET PAY", "Rupees Twenty One Thousand Two Hundred Only"]) {
  if (!text.includes(bit)) throw new Error(`Missing ${bit}\n${text}`);
}
const cols = await slip.locator(".pay-slip-cols").evaluate(node => getComputedStyle(node).gridTemplateColumns);
if (!cols.includes(" ")) throw new Error(`Earnings and deductions should sit side by side: ${cols}`);
await slip.screenshot({ path: ".tmp/payslip-desktop.png" });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const stacked = await slip.locator(".pay-slip-cols").evaluate(node => getComputedStyle(node).gridTemplateColumns);
await slip.screenshot({ path: ".tmp/payslip-mobile.png" });
if (errors.length) throw new Error(errors.join("\n"));
console.log("payslip ok", { cols, stacked });
await browser.close();
