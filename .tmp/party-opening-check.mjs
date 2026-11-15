import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4174/accounting");
await page.getByRole("button", { name: "New", exact: true }).click({ timeout: 15000 });
await page.getByRole("menuitem", { name: "Party", exact: true }).click();
const dialog = page.getByRole("dialog", { name: "Add party" });
const opening = () => dialog.getByRole("textbox", { name: "Opening Balance (If Any)" });
await opening().waitFor({ state: "visible" });
const customerHint = await opening().getAttribute("placeholder");
if (customerHint !== "They already owe you") throw new Error(`customer hint ${customerHint}`);
for (const type of ["Employee", "Agent", "Other"]) {
  await dialog.getByRole("combobox", { name: "Party type" }).click();
  await page.getByRole("option", { name: type, exact: true }).click();
  if (await opening().count()) throw new Error(`${type} still shows opening balance`);
}
await dialog.getByRole("combobox", { name: "Party type" }).click();
await page.getByRole("option", { name: "Supplier", exact: true }).click();
await opening().waitFor({ state: "visible" });
const supplierHint = await opening().getAttribute("placeholder");
if (supplierHint !== "You already owe them") throw new Error(`supplier hint ${supplierHint}`);
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
console.log("ok");
