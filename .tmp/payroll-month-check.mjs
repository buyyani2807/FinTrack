import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5182";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting/payroll`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "September 2026" }).waitFor({ timeout: 30000 });
const month = page.getByLabel("Month");
await month.waitFor();
const tag = await month.evaluate(el => el.tagName);
if (tag !== "SELECT") throw new Error(`Month control is ${tag}`);
const box = await month.boundingBox();
if (!box || box.width > 240 || box.width < 160) throw new Error(`Month width ${box?.width}`);
const labels = await month.locator("option").allTextContents();
for (const label of ["October 2026", "September 2026", "April 2026"]) {
  if (!labels.includes(label)) throw new Error(`Missing ${label}: ${labels.join(", ")}`);
}
if (labels.includes("March 2026")) throw new Error(`History starts too early: ${labels.join(", ")}`);
await month.selectOption("2026-08");
await page.getByRole("heading", { name: "August 2026" }).waitFor();
await page.screenshot({ path: ".tmp/payroll-month.png" });
await page.setViewportSize({ width: 390, height: 844 });
const mobile = await page.getByLabel("Month").boundingBox();
if (!mobile || mobile.width > 390) throw new Error(`Mobile month width ${mobile?.width}`);
if (errors.length) throw new Error(errors.join("\n"));
console.log("month menu ok", labels.join(" | "), "width", Math.round(box.width));
await browser.close();
