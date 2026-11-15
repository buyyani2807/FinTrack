import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mockAccountsWorkspace(page);

const openNumber = async (number, title) => {
  await page.getByRole("button", { name: number, exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  const print = dialog.getByRole("button", { name: "Print" });
  const pdf = dialog.getByRole("button", { name: "Download PDF" });
  if (!(await print.isVisible()) || !(await pdf.isVisible())) throw new Error(`${title} is missing Print or PDF`);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  console.log("opened", title, number);
};

await page.goto("http://127.0.0.1:4174/accounting/reports/receivables");
await page.getByRole("button", { name: "S-1", exact: true }).waitFor({ timeout: 15000 });
const view = page.getByRole("button", { name: "View", exact: true }).first();
if (!(await view.isVisible())) throw new Error("View button missing on receivables");
await view.click();
const sale = page.getByRole("dialog", { name: "SALES INVOICE" });
await sale.waitFor({ state: "visible" });
await sale.getByRole("button", { name: "Close", exact: true }).click();
console.log("view button opened SALES INVOICE");

await openNumber("S-1", "SALES INVOICE");
await page.goto("http://127.0.0.1:4174/accounting/reports/payables");
await page.getByRole("button", { name: "P-1", exact: true }).waitFor();
await openNumber("P-1", "PURCHASE BILL");
await page.goto("http://127.0.0.1:4174/accounting/reports/ledger");
await page.getByRole("combobox", { name: "Account", exact: true }).click();
await page.getByRole("option", { name: "4000 · Sales" }).click();
await openNumber("S-1", "SALES INVOICE");
await page.getByRole("combobox", { name: "Account", exact: true }).click();
await page.getByRole("option", { name: "1000 · Cash" }).click();
await openNumber("R-1", "RECEIPT");
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
console.log("ok");
