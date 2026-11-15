// Capture-only probe (never committed).
import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";
import { richRows, richRpc } from "./capture-data.mjs";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  const body = rpc ? richRpc(rpc[1]) : richRows(url);
  if (body === undefined) return route.fallback();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
await page.addInitScript(() => localStorage.setItem("fintrack-accounts-onboarding-v1:co1", "done"));
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
await page.goto("http://127.0.0.1:5175/accounting/setup", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Start setup" }).click({ timeout: 60000 });
await page.locator(".acc-setup .acc-bk-head").waitFor({ timeout: 40000 });
for (let i = 0; i < 6; i += 1) {
  const info = await page.evaluate(() => ({
    forms: document.querySelectorAll("form.acc-bk-form").length,
    setups: document.querySelectorAll(".acc-setup").length,
    input: document.querySelector(".acc-setup .acc-bk-form input")?.value,
    ask: document.querySelector(".acc-setup-ask.is-current")?.textContent,
  }));
  console.log(i, JSON.stringify(info));
  await page.waitForTimeout(1000);
}
const t0 = Date.now();
await page.evaluate(() => document.querySelector(".acc-setup form.acc-bk-form").requestSubmit());
await page.waitForTimeout(800);
console.log("after submit", Date.now() - t0, await page.locator(".acc-setup-ask.is-current").innerText());
console.log(errors.slice(0, 5).join("\n") || "no errors");
await browser.close();
