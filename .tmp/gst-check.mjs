import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";
import { richRows, richRpc } from "./capture-data.mjs";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  const body = rpc ? richRpc(rpc[1]) : richRows(url);
  if (body === undefined) return route.fallback();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
await page.addInitScript(() => localStorage.setItem("fintrack-accounts-onboarding-v1:co1", "done"));

await page.goto("http://127.0.0.1:5175/accounting/inventory/items", { waitUntil: "domcontentloaded" });
await page.locator("h1").first().waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "+ Item" }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Copper wire");
await page.getByRole("button", { name: "Use this" }).waitFor();
await page.getByRole("button", { name: "Use this" }).click();
const hsn = await page.getByLabel("HSN / SAC").inputValue();
const rate = await page.getByLabel("GST %").inputValue();
console.log("item suggestion", hsn, rate);

await page.goto("http://127.0.0.1:5175/accounting/ai-review", { waitUntil: "domcontentloaded" });
await page.locator("button.accounts-section-tab", { hasText: "GSTR-2B" }).click();
await page.locator("input[type=file]").setInputFiles({
  name: "gstr2b.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("GSTIN,Invoice number,Invoice date,Taxable value,CGST,SGST,IGST\n27AAAAA0000A1Z5,UNK/1,16-09-2026,500,0,0,90\n"),
});
await page.getByText("Reject").first().waitFor({ timeout: 15000 });
console.log("itc row", (await page.locator(".ai-review-body table").innerText()).replace(/\s+/g, " ").slice(0, 240));
console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no page errors");
await browser.close();
