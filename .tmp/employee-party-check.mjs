import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);

await page.goto(`${base}/accounting/parties/ledger`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Customer profile" }).waitFor({ timeout: 30000 });
await page.getByText("Ravi Stores").first().waitFor();

await page.getByRole("combobox", { name: "Party" }).click();
await page.getByRole("option", { name: /Anita Rao/ }).click();
await page.getByText("Pay, attendance, and leave for Anita Rao are in Payroll.").waitFor();
if (await page.getByRole("button", { name: "Employee profile" }).count()) throw new Error("Employee profile button is still shown");
if (await page.getByRole("button", { name: /Statement PDF|WhatsApp/ }).count()) throw new Error("Customer statement actions are still shown");
if (await page.getByText("Credit score").count()) throw new Error("Credit score is shown on the employee ledger");
if (await page.getByText("Outstanding").count()) throw new Error("Outstanding is shown for the employee");

await page.getByRole("button", { name: "Open payroll" }).click();
await page.getByRole("cell", { name: /Anita Rao/ }).waitFor({ timeout: 15000 });

await page.goto(`${base}/accounting/parties/profile/p3`, { waitUntil: "domcontentloaded" });
await page.getByText("Pay, attendance, and leave for Anita Rao are in Payroll.").waitFor({ timeout: 15000 });
if (await page.getByText("Credit score").count()) throw new Error("Credit score is shown on the employee profile address");
if (await page.locator(".acc-party-profile").count()) throw new Error("Customer profile layout opened for the employee");
await page.getByRole("button", { name: "Party ledger", exact: true }).click();
await page.getByText("Pay, attendance, and leave for Anita Rao are in Payroll.").waitFor();

await page.getByRole("combobox", { name: "Party" }).click();
await page.getByRole("option", { name: /Ravi Stores/ }).click();
await page.getByRole("button", { name: "Customer profile" }).click();
await page.locator(".acc-party-profile").waitFor();
if (!(await page.getByText("FinTrack credit score").count())) throw new Error("Customer credit score is missing");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/accounting/parties/ledger`, { waitUntil: "domcontentloaded" });
await page.getByRole("combobox", { name: "Party" }).click();
await page.getByRole("option", { name: /Anita Rao/ }).click();
await page.getByRole("button", { name: "Open payroll" }).waitFor();
if (await page.getByRole("button", { name: "Employee profile" }).count()) throw new Error("Employee profile button is shown on a phone");

if (errors.length) throw new Error(errors.join("\n"));
console.log("employee party ok");
await browser.close();
