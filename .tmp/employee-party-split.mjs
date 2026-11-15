import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4176/accounting/parties/ledger", { waitUntil: "networkidle" });
await page.getByRole("combobox", { name: "Party" }).click({ timeout: 15000 });
const names = (await page.getByRole("option").allTextContents()).map(text => text.trim());
if (names.some(name => /Anita/.test(name))) throw new Error(`employee listed in party ledger: ${names.join(" | ")}`);
if (!names.some(name => /Ravi Stores/.test(name)) || !names.some(name => /Sri Wholesale/.test(name))) {
  throw new Error(`missing trade parties: ${names.join(" | ")}`);
}
await page.keyboard.press("Escape");

await page.getByRole("button", { name: "New", exact: true }).click();
await page.getByRole("menuitem", { name: "Party", exact: true }).click();
const addParty = page.getByRole("dialog", { name: "Add party" });
await addParty.getByRole("combobox", { name: "Party type" }).click();
if (await page.getByRole("option", { name: "Employee", exact: true }).count()) throw new Error("Employee is still a party type");
await page.keyboard.press("Escape");
await addParty.getByRole("button", { name: "Close", exact: true }).click();

await page.goto("http://127.0.0.1:4176/accounting/payroll", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add employee" }).first().click({ timeout: 15000 });
const dialog = page.getByRole("dialog", { name: "Add employee" });
await dialog.getByRole("textbox", { name: "Name" }).waitFor();
await dialog.getByRole("textbox", { name: "Phone" }).waitFor();
await dialog.getByRole("textbox", { name: "Email" }).waitFor();
if (await dialog.getByRole("combobox", { name: "Party type" }).count()) throw new Error("payroll form still asks for a party type");
await dialog.getByRole("button", { name: "Close", exact: true }).click();
await page.getByRole("button", { name: "Edit", exact: true }).first().click();
const edit = page.getByRole("dialog", { name: "Edit employee" });
const shown = await edit.getByRole("textbox", { name: "Name" }).inputValue();
if (shown !== "Anita Rao") throw new Error(`edit opened ${shown}`);
console.log("ok", names.filter(Boolean).join(" | "));
await browser.close();
