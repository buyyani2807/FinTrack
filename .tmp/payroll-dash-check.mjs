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
await page.locator(".pay-person", { hasText: "Anita Rao" }).waitFor();
const openText = await page.locator(".acc-panel").innerText();
for (const bit of ["Monthly salaries", "₹24,000", "To pay this month", "₹21,200", "Ready", "29 paid", "1 loss", "Post salary", "Deductions", "₹2,800"]) {
  if (!openText.includes(bit)) throw new Error(`Open month missing ${bit}\n${openText}`);
}
const openOverflow = await page.locator(".pay-register").evaluate(el => el.scrollWidth - el.clientWidth);
if (openOverflow > 2) throw new Error(`register overflows by ${openOverflow}`);
await page.screenshot({ path: ".tmp/payroll-dash-desktop.png", fullPage: false });

await page.route("**/rest/v1/rpc/acc_payroll_bundle**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    profiles: [{ party_id: "p3", basic: 25000, hra: 0, allowance: 0, day_basis: 0, pf: 0, esi: 0, professional_tax: 0, tds: 0, other_deduction: 0 }],
    days: [],
    leave: [],
    run: {
      id: "run1",
      period_month: "2026-09-01",
      status: "posted",
      pay_date: "2026-09-30",
      pay_mode: "bank",
      pay_account_id: "bank",
      lines: [{
        partyId: "p3",
        name: "Anita Rao",
        paidDays: 30,
        lopDays: 0,
        basis: 30,
        basic: 25000,
        hra: 0,
        allowance: 0,
        gross: 25000,
        earned: 25000,
        deductions: { pf: 0, esi: 0, professionalTax: 0, tds: 0, otherDeduction: 0 },
        deductionTotal: 0,
        net: 25000,
      }],
    },
  }),
}));
await page.route("**/rest/v1/acc_parties**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    { id: "p1", party_type: "customer", name: "Ravi Stores", phone: "9876543210", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
    { id: "p3", party_type: "employee", name: "Anita Rao", phone: "9845011122", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
    { id: "p4", party_type: "employee", name: "Meera Nair", phone: "9845000000", email: "", address: "", gstin: "", state_code: "", gst_registration: "", notes: "", is_active: true },
  ]),
}));
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".pay-person", { hasText: "Meera Nair" }).waitFor({ timeout: 20000 });
const postedText = await page.locator(".acc-panel").innerText();
for (const bit of ["Anita Rao", "Meera Nair", "Posted", "Next month", "Paid this month", "₹25,000", "1 start next month", "1 still need a salary"]) {
  if (!postedText.includes(bit)) throw new Error(`Posted view missing ${bit}\n${postedText}`);
}
if (await page.getByRole("button", { name: "Post salary" }).count()) throw new Error("Post salary should stay off a posted month");
await page.locator(".pay-person", { hasText: "Meera Nair" }).getByRole("button", { name: "Set salary" }).click();
await page.getByRole("dialog", { name: "Salary for Meera Nair" }).waitFor();
await page.getByRole("button", { name: "Close" }).click();
await page.screenshot({ path: ".tmp/payroll-dash-posted.png" });

await page.setViewportSize({ width: 390, height: 844 });
await page.locator(".pay-person", { hasText: "Meera Nair" }).waitFor();
const fit = await page.locator(".acc-panel").evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
if (fit.sw > fit.cw + 2) throw new Error(`panel overflow ${JSON.stringify(fit)}`);
await page.screenshot({ path: ".tmp/payroll-dash-mobile.png" });
if (errors.length) throw new Error(errors.join("\n"));
console.log("payroll dashboard ok");
await browser.close();
