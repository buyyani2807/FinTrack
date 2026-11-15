import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = "http://127.0.0.1:5191";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/acc_parties**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify([
    { id: "p1", party_type: "customer", name: "Ravi Stores", phone: "", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
    { id: "p3", party_type: "employee", name: "Anita Rao", phone: "", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
    { id: "p4", party_type: "employee", name: "Aarush Buyyani", phone: "", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
  ]),
}));
await page.route("**/rest/v1/rpc/acc_payroll_bundle**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    profiles: [
      { party_id: "p3", basic: 25000, hra: 0, allowance: 0, day_basis: 0, pf: 0, esi: 0, professional_tax: 0, tds: 0, other_deduction: 0 },
      { party_id: "p4", basic: 18000, hra: 0, allowance: 0, day_basis: 0, pf: 0, esi: 0, professional_tax: 0, tds: 0, other_deduction: 0 },
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
        deductionTotal: 0, net: 25000, voucherId: "v-anita", sourceId: "11111111-1111-4111-8111-111111111111",
      }],
    },
  }),
}));

await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "September 2026" }).waitFor({ timeout: 20000 });
const anita = page.locator(".pay-register-table tr", { hasText: "Anita Rao" });
const aarush = page.locator(".pay-register-table tr", { hasText: "Aarush Buyyani" });
await aarush.waitFor();
if (await anita.getByRole("button", { name: "Post salary" }).count()) throw new Error("Posted employee still has Post salary");
await aarush.getByRole("button", { name: "Post salary" }).click();
await page.getByRole("heading", { name: "Post salary for Aarush Buyyani" }).waitFor();
const dialog = await page.locator(".modal-bg").innerText();
if (!dialog.includes("18,000")) throw new Error(dialog);
await page.screenshot({ path: ".tmp/qa04-late-post.png" });
if (errors.length) throw new Error(errors.join("\n"));
console.log("late post ok");
await browser.close();
