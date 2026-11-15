import { chromium } from "playwright";

const base = "http://127.0.0.1:4192";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  headless: true,
});

const pages = [
  ["/features/payroll", ["Payroll", "payslip", "Provident fund"]],
  ["/features/for-the-ca", ["For the CA", "trial balance", "Nothing is sent"]],
  ["/features/item-profit", ["Item Profit", "weighted average", "Requires review"]],
  ["/features/trade-documents", ["Quotations and Orders", "delivery challan", "does not post"]],
];

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];

await page.goto(`${base}/features`, { waitUntil: "networkidle" });
const featuresText = await page.locator("#mkt-main").innerText();
for (const name of ["Payroll", "For the CA", "Item Profit", "Quotations and Orders"]) {
  if (!featuresText.includes(name)) failures.push(`features page missing ${name}`);
}

await page.locator(".mkt-product").hover();
const menu = await page.locator(".mkt-product-panel").innerText();
if (!menu.includes("Payroll") || !menu.includes("For the CA") || !menu.includes("Item Profit") || !menu.includes("Quotations and Orders")) {
  failures.push(`nav missing new accounts items: ${menu}`);
}

for (const [path, bits] of pages) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  for (const bit of bits) {
    if (!text.includes(bit)) failures.push(`${path} missing ${bit}`);
  }
  const shot = await page.locator(".mkt-shot img").getAttribute("src");
  if (!shot) failures.push(`${path} missing preview`);
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/features/payroll`, { waitUntil: "networkidle" });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
if (overflow) failures.push("payroll phone overflow");

await page.goto(`${base}/`, { waitUntil: "networkidle" });
const home = await page.locator("body").innerText();
for (const bit of ["Payroll, attendance, leave, and payslips", "For the CA"]) {
  if (!home.includes(bit)) failures.push(`home missing ${bit}`);
}

await page.goto(`${base}/pricing`, { waitUntil: "networkidle" });
const pricing = await page.locator("body").innerText();
if (!pricing.includes("payroll")) failures.push("pricing missing payroll");

await page.goto(`${base}/security`, { waitUntil: "networkidle" });
const security = await page.locator("body").innerText();
if (!security.includes("accountant")) failures.push("security missing accountant");

console.log(failures.length ? failures.join("\n") : "site features ok");
await browser.close();
process.exit(failures.length ? 1 : 0);
