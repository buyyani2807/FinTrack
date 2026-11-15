import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5182";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "September 2026" }).waitFor({ timeout: 30000 });
const panel = page.locator(".acc-panel");
const text = await panel.innerText();
for (const bit of ["Payroll", "Open", "Gross payroll", "Net payable", "Employees", "Anita Rao", "Post salary", "Loss-of-pay days"]) {
  if (!text.includes(bit)) throw new Error(`Missing ${bit}\n${text}`);
}
await page.getByRole("button", { name: "Attendance" }).click();
await page.getByLabel("2026-09-02 attendance").waitFor();
await page.getByRole("button", { name: "Pay", exact: true }).click();
await page.getByLabel("Search employees").fill("nobody");
await page.getByText("No employee matches this search.").waitFor();
await page.getByLabel("Search employees").fill("Anita");
await page.locator(".pay-person", { hasText: "Anita Rao" }).waitFor();
const overflow = await page.locator(".pay-register").evaluate(el => el.scrollWidth - el.clientWidth);
if (overflow > 2) throw new Error(`overflow ${overflow}`);
await page.screenshot({ path: ".tmp/payroll-workspace.png" });
await page.setViewportSize({ width: 390, height: 844 });
const mobile = await page.locator(".acc-panel").evaluate(el => el.scrollWidth - el.clientWidth);
if (mobile > 2) throw new Error(`mobile overflow ${mobile}`);
await page.screenshot({ path: ".tmp/payroll-workspace-mobile.png" });
if (errors.length) throw new Error(errors.join("\n"));
console.log("payroll workspace ok");
await browser.close();
