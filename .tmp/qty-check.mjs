import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4174/accounting");

for (const kind of ["Sale", "Purchase"]) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: kind, exact: true }).click();
  const dialog = page.locator(".modal-bg").last();
  await dialog.waitFor({ state: "visible" });
  const qty = dialog.locator(".acc-item-line-card input").first();
  const type = await qty.getAttribute("type");
  const mode = await qty.getAttribute("inputmode");
  if (type !== "text" || mode !== "numeric") throw new Error(`${kind} qty is type=${type} inputmode=${mode}`);
  await qty.fill("1.045");
  const value = await qty.inputValue();
  if (value !== "1") throw new Error(`${kind} qty became ${value}`);
  const spin = await dialog.locator(".acc-item-line-card input[type=number]").count();
  const qtySpin = await qty.evaluate(node => getComputedStyle(node, "::-webkit-inner-spin-button").display);
  console.log(kind, "value", value, "card number inputs", spin, "spin display", qtySpin);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
}

if (errors.length) throw new Error(errors.join("\n"));
await browser.close();
console.log("ok");
