import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";

const token = (() => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: "agent-1" })).toString("base64url");
  return `${header}.${payload}.e2e`;
})();

const account = {
  id: "fa1",
  customer_id: "c1",
  kind: "daily",
  start_date: "2026-09-01",
  collection_amount: 10000,
  disbursed_amount: 9000,
  daily_collection: 100,
  principal: 0,
  monthly_interest_rate: 0,
  penalty_rate: 0,
  status: "active",
  collection_order: 1,
  customers: { full_name: "Lakshmi Devi", phone: "", address: "" },
  payments: [],
  rate_changes: [],
  customer_portal_credentials: [],
};

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**/api/auth/**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(route.request().method() === "GET" ? { access_token: token, expires_in: 3600 } : {}),
}));
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  let body = [];
  if (url.includes("/profiles?")) {
    body = [{
      id: "agent-1",
      full_name: "Route Agent",
      role: "staff",
      is_active: true,
      collection_scope: "finance",
      accounts_company_id: null,
      organizations: { name: "E2E Finance" },
    }];
  } else if (url.includes("/finance_accounts?")) body = [account];
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(rpc ? (rpc[1] === "my_agent_company_name" ? "" : []) : body),
  });
});
await page.goto("http://127.0.0.1:5175/dashboard", { waitUntil: "domcontentloaded" });
await page.waitForURL(/\/daily-finance\/todays-collections$/, { timeout: 15000 });
const collectionsTab = page.getByRole("button", { name: "Today’s collections" });
await collectionsTab.waitFor({ state: "visible", timeout: 15000 });
const tabsBefore = await page.locator(".module-section-tab").allTextContents();
const collectionsVisible = await collectionsTab.isVisible();
await page.getByRole("button", { name: "Details" }).click();
await page.waitForURL(/\/daily-finance\/users\?account=fa1$/);
const tabsAfter = await page.locator(".module-section-tab").allTextContents();
const collectionsStill = await page.getByRole("button", { name: "Today’s collections" }).isVisible();
console.log(JSON.stringify({ url: page.url(), tabsBefore, collectionsVisible, tabsAfter, collectionsStill }, null, 2));
await browser.close();
