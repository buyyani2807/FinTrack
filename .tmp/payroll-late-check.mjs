import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5182";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/rpc/acc_payroll_bundle**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    profiles: [
      { party_id: "p3", basic: 25000, hra: 0, allowance: 0, day_basis: 0, pf: 0, esi: 0, professional_tax: 0, tds: 0, other_deduction: 0 },
      { party_id: "p4", basic: 15000, hra: 0, allowance: 0, day_basis: 0, pf: 0, esi: 0, professional_tax: 0, tds: 0, other_deduction: 0 },
    ],
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
        partyId: "p3", name: "Anita Rao", paidDays: 30, lopDays: 0, basis: 30,
        basic: 25000, hra: 0, allowance: 0, gross: 25000, earned: 25000,
        deductions: { pf: 0, esi: 0, professionalTax: 0, tds: 0, otherDeduction: 0 },
        deductionTotal: 0, net: 25000,
      }],
    },
  }),
}));
await page.route("**/rest/v1/acc_parties**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    { id: "p3", party_type: "employee", name: "Anita Rao", phone: "9845011122", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
    { id: "p4", party_type: "employee", name: "Meera Nair", phone: "9845000000", email: "", address: "", gstin: "", state_code: "", gst_registration: "", notes: "", is_active: true },
  ]),
}));
await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
const meera = page.locator(".pay-person", { hasText: "Meera Nair" });
await meera.waitFor({ timeout: 30000 });
const meeraText = await meera.innerText();
if (!meeraText.includes("Not posted") || !meeraText.includes("15,000")) throw new Error(meeraText);
const anita = page.locator(".pay-person", { hasText: "Anita Rao" });
if (await anita.getByRole("button", { name: "Post salary" }).count()) throw new Error("Posted employee still has Post salary");
await meera.getByRole("button", { name: "Post salary" }).click();
const dialog = page.getByRole("dialog", { name: /Post salary/ });
await dialog.waitFor();
const copy = await dialog.innerText();
if (!copy.includes("Meera Nair") || copy.includes("Anita Rao")) throw new Error(copy);
await page.screenshot({ path: ".tmp/payroll-late.png" });
if (errors.length) throw new Error(errors.join("\n"));
console.log("late post ok");
await browser.close();
