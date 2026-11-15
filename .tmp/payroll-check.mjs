import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Payroll", exact: true }).waitFor({ timeout: 30000 });
await page.getByRole("cell", { name: /Anita Rao/ }).waitFor({ timeout: 15000 });
const table = await page.locator("table").first().innerText();
if (!table.includes("23,200") || !table.includes("21,200")) {
  console.log(table);
  throw new Error("Expected earned 23200 and net 21200");
}
await page.getByRole("button", { name: "Payslip" }).click();
await page.getByRole("dialog", { name: /Payslip/ }).waitFor();
const slip = await page.locator(".pay-slip").innerText();
if (!slip.includes("21,200") || !slip.includes("does not calculate")) throw new Error(`Payslip missing figures:\n${slip}`);
await page.getByRole("button", { name: "Close" }).click();
await page.getByRole("button", { name: "Attendance", exact: true }).click();
await page.getByLabel("2026-09-02 attendance").waitFor();
const absent = await page.getByLabel("2026-09-02 attendance").inputValue();
if (absent !== "absent") throw new Error(`2 Sep should be absent, got ${absent}`);
const sunday = await page.getByLabel("2026-09-06 attendance").inputValue();
if (sunday !== "week_off") throw new Error(`6 Sep should be weekly off, got ${sunday}`);
if (!(await page.getByText("Paid leave").count())) throw new Error("Paid leave days were not shown");
await page.getByRole("button", { name: "Leave", exact: true }).click();
await page.getByRole("cell", { name: "Family function" }).waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Pay", exact: true }).click();
await page.getByRole("cell", { name: /Anita Rao/ }).waitFor();
if (errors.length) throw new Error(errors.join("\n"));
console.log("payroll ok");
await browser.close();
