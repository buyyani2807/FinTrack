import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5191";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
await mockAccountsWorkspace(page);
await page.goto(`${base}/accounting`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Accounts" }).waitFor({ timeout: 30000 });

const order = await page.locator(".acc-overview > *").evaluateAll(nodes => nodes.map(node => {
  if (node.classList.contains("acc-brief") || node.querySelector?.(".acc-brief-head")) return "brief";
  if (node.classList.contains("acc-money-tiles")) return "money";
  if (node.classList.contains("acc-ov-charts")) return "charts";
  if (node.classList.contains("accounts-business-pulse")) return "pulse";
  if (node.classList.contains("acc-ov-metrics-block")) return "metrics";
  return node.className.split(/\s+/).slice(0, 2).join(".") || node.tagName;
}));
const briefAt = order.indexOf("brief");
const moneyAt = order.indexOf("money");
if (briefAt < 0 || moneyAt < 0 || briefAt > moneyAt) throw new Error(`overview order ${JSON.stringify(order)}`);
await page.screenshot({ path: ".tmp/phase5-accounts-desktop.png", fullPage: false });

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
const pulseKpis = await page.locator(".acc-overview .accounts-business-kpis").evaluate(el => getComputedStyle(el).display).catch(() => "missing");
const metrics = await page.locator(".acc-overview .acc-ov-metrics-block").evaluate(el => getComputedStyle(el).display).catch(() => "missing");
if (pulseKpis !== "none" && pulseKpis !== "missing") throw new Error(`pulse KPIs still visible on phone ${pulseKpis}`);
if (metrics !== "none" && metrics !== "missing") throw new Error(`metrics block still visible on phone ${metrics}`);
await page.screenshot({ path: ".tmp/phase5-accounts-phone.png", fullPage: false });

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}/daily-finance/collections`, { waitUntil: "domcontentloaded" });
await page.getByText("Collected today").first().waitFor({ timeout: 30000 });
await page.screenshot({ path: ".tmp/phase5-daily-desktop.png", fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
const badge = await page.locator(".collection-route-table .badge").first().count();
if (!badge) throw new Error("collection status badge missing");
await page.screenshot({ path: ".tmp/phase5-daily-phone.png", fullPage: false });

if (errors.length) throw new Error(errors.join("\n"));
console.log("phase5 ok", { order: order.filter(id => ["brief", "money", "charts", "pulse", "metrics"].includes(id)) });
await browser.close();
