import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mockAccountsWorkspace(page);

const check = async kind => {
  await page.goto("http://127.0.0.1:4174/accounting");
  await page.getByRole("button", { name: "New", exact: true }).click({ timeout: 15000 });
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
  const dialog = page.locator(".modal-bg").last();
  const unit = dialog.locator(".acc-item-line-card").getByRole("combobox", { name: "Unit" });
  await unit.waitFor({ state: "visible" });
  await unit.click();
  const search = page.getByRole("textbox", { name: "Search options" });
  await search.fill("k");
  const options = page.getByRole("option");
  const names = (await options.allTextContents()).map(text => text.trim()).filter(Boolean);
  for (const wanted of ["Kg", "Kilolitre", "Kilometre"]) {
    if (!names.includes(wanted)) throw new Error(`${kind} missing ${wanted}: ${names.join(", ")}`);
  }
  for (const blocked of ["Carton", "Pack", "Bottle", "Nos"]) {
    if (names.includes(blocked)) throw new Error(`${kind} listed ${blocked} for k`);
  }
  await page.getByRole("option", { name: "Kg", exact: true }).click();
  const shown = (await unit.innerText()).trim();
  if (shown !== "Kg") throw new Error(`${kind} selected ${shown}`);
  console.log(kind, names.join(", "));
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
};

await check("Sale");
await check("Purchase");
if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
console.log("ok");
