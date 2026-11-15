// Capture-only: marketing screenshots from a mocked, realistic demo workspace (never committed).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";
import { DEBUG, richRows, richRpc } from "./capture-data.mjs";

const base = process.env.BASE || "http://127.0.0.1:5175";
const out = process.env.OUT || ".tmp/shots";
const only = process.argv.slice(2);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1360), height: Number(process.env.VH || 860) }, deviceScaleFactor: 2 });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/**", route => {
  const url = route.request().url();
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
  const body = rpc ? richRpc(rpc[1]) : richRows(url);
  if (body === undefined) return route.fallback();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
if (!process.env.ONBOARD) await page.addInitScript(() => {
  localStorage.setItem("fintrack-accounts-onboarding-v1:co1", "done");
});
else await page.addInitScript(() => {
  localStorage.removeItem("fintrack-accounts-onboarding-v1:co1");
  sessionStorage.removeItem("fintrack-setup-assistant-v1:co1");
});
if (process.env.THEME) await page.addInitScript(theme => localStorage.setItem("fintrack-theme", theme), process.env.THEME);
const AGENTS = [
  { id: "ag1", full_name: "Suresh Naik", email: "", phone: "9845011220", is_active: true, portal_id: "SLF-AG01", collection_scope: "finance", assigned_customer_count: 5 },
  { id: "ag2", full_name: "Prakash Gowda", email: "", phone: "9845033440", is_active: true, portal_id: "SLF-AG02", collection_scope: "finance", assigned_customer_count: 3 },
  { id: "ag3", full_name: "Mahesh R", email: "", phone: "9845055660", is_active: true, portal_id: "SLF-AG03", collection_scope: "accounts", accounts_company_id: "co1", route_customers: [{}, {}, {}, {}] },
];
await page.route("**/api/agents", route => (route.request().method() === "GET"
  ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(AGENTS) })
  : route.fallback()));

const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));

async function open(path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(700);
}

async function answerSetup() {
  const setup = page.locator(".acc-setup");
  const step = async (label, work) => {
    try {
      await work();
    } catch (err) {
      console.log("setup step failed:", label, String(err.message).split("\n")[0]);
      console.log("current:", (await setup.locator(".acc-setup-ask.is-current").innerText().catch(() => "?")), "| buttons:", (await setup.locator(".acc-setup-answer button").allInnerTexts()).join(" / "));
      throw err;
    }
  };
  const next = label => step(label, async () => {
    await setup.locator("form.acc-bk-form").evaluate(form => form.requestSubmit(), undefined, { timeout: 30000 });
    await page.waitForTimeout(400);
  });
  await next("name");
  await step("business", () => setup.locator(".acc-bk-form input").fill("Electrical wholesale", { timeout: 8000 }));
  await next("business");
  await step("products", () => setup.getByRole("button", { name: /^Yes, products/ }).click({ timeout: 8000 }));
  await step("inventory", () => setup.locator(".acc-setup-answer").getByRole("button", { name: /^Yes/ }).first().click({ timeout: 8000 }));
  await step("gst", () => setup.getByRole("button", { name: "Yes, regular GST" }).click({ timeout: 8000 }));
  await step("gstin", () => setup.locator(".acc-bk-form input").fill("29AAACR5055K1Z3", { timeout: 8000 }));
  await next("gstin");
  await step("credit", () => setup.locator(".acc-setup-answer").getByRole("button", { name: /^Yes/ }).first().click({ timeout: 8000 }));
  await step("banks", () => setup.locator(".acc-bk-form input").fill("HDFC and SBI", { timeout: 8000 }));
  await next("banks");
  if (await setup.locator(".acc-setup-plan").count()) return;
  await step("start", () => setup.locator(".acc-setup-answer .acc-bk-chip.is-suggested").click({ timeout: 8000 }));
}

async function openMigration() {
  await open("/accounting/setup");
  const showMig = page.getByRole("button", { name: "Show Migration" });
  if (await showMig.count()) await showMig.click().catch(() => {});
  await scrollToText("Start migration", 80);
  await page.getByRole("button", { name: "Start migration" }).click();
  await page.locator(".acc-mig-drop input").setInputFiles([".tmp/mig/tally-export.xml", ".tmp/mig/zoho-contacts.csv", ".tmp/mig/bookkeeper-journal.xlsx"]);
  await page.locator(".acc-mig-tiles").waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
}

async function scrollToText(text, offset = 16) {
  const target = page.getByText(text, { exact: false }).first();
  await target.waitFor({ timeout: 40000 });
  await target.evaluate((el, gap) => {
    const scroller = (node => {
      for (let current = node.parentElement; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
      }
      return null;
    })(el);
    if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - gap;
    else window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - gap));
  }, offset);
  await page.waitForTimeout(300);
}

const clickTab = async (name, scope = "main") => {
  await page.locator(scope).getByRole("button", { name, exact: true }).last().click();
  await page.waitForTimeout(800);
};
const aiTab = async name => {
  await page.locator("button.accounts-section-tab", { hasText: name }).first().click();
  await page.waitForTimeout(800);
};

const SRIW_GSTIN = DEBUG.PARTIES.find(row => row.id === "sriw").gstin;
await page.route("**/api/accounts/bill-scan", route => route.fulfill({
  status: 200, contentType: "application/json", body: JSON.stringify({
    bill: {
      supplierName: "Sri Wholesale Traders", supplierGstin: SRIW_GSTIN, billNumber: "SWT/2431", billDate: "2026-09-29", paymentStatus: "unpaid", documentKind: "invoice",
      lines: [
        { name: "Sona Masoori Rice 25kg", quantity: 20, rate: 1650, gstRate: 5, hsn: "1006" },
        { name: "Sugar 50kg", quantity: 10, rate: 2000, gstRate: 5, hsn: "1701" },
      ],
      taxable: 53000, cgst: 1325, sgst: 1325, total: 55650,
    },
  }),
}));

async function billPhoto() {
  const path = ".tmp/shots/bill-photo.png";
  const sheet = await browser.newPage({ viewport: { width: 520, height: 700 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<html><body style="margin:0;background:#d9d4c7;font-family:Georgia,serif">
    <div id="bill" style="margin:24px;padding:22px;background:#fffdf6;box-shadow:0 2px 8px rgba(0,0,0,.25);transform:rotate(-1.2deg);color:#222">
      <div style="text-align:center;font-weight:bold;font-size:20px">SRI WHOLESALE TRADERS</div>
      <div style="text-align:center;font-size:12px">APMC Yard, Yeshwanthpur, Bengaluru · GSTIN ${SRIW_GSTIN}</div>
      <hr><div style="display:flex;justify-content:space-between;font-size:13px"><span>Tax Invoice No: SWT/2431</span><span>Date: 29/09/2026</span></div>
      <div style="font-size:13px;margin:6px 0">To: Sri Lakshmi Traders, Bengaluru</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse" border="1" cellpadding="5">
        <tr><th>Item</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
        <tr><td>Sona Masoori Rice 25kg</td><td>1006</td><td>20</td><td>1650</td><td>33,000</td></tr>
        <tr><td>Sugar 50kg</td><td>1701</td><td>10</td><td>2000</td><td>20,000</td></tr>
        <tr><td colspan="4" align="right">Taxable</td><td>53,000</td></tr>
        <tr><td colspan="4" align="right">CGST 2.5% + SGST 2.5%</td><td>2,650</td></tr>
        <tr><td colspan="4" align="right"><b>Total</b></td><td><b>55,650</b></td></tr>
      </table>
      <div style="font-size:12px;margin-top:10px">Payment: Credit 30 days</div>
    </div></body></html>`);
  await sheet.locator("#bill").screenshot({ path });
  await sheet.close();
  return path;
}

const outstandingOnly = async () => {
  await page.getByText("Outstanding only", { exact: true }).first().click();
  await page.waitForTimeout(600);
};

const SHOTS = {
  dashboard: async () => { await open("/dashboard"); },
  finance: async () => { await open("/daily-finance/todays-collections"); },
  "collect-first": async () => { await open("/daily-finance/todays-collections"); await scrollToText("Who to collect first"); },
  "finance-reports": async () => { await open("/daily-finance/reports"); await clickTab("Daily P&L"); },
  "finance-overview": async () => { await open("/daily-finance/overview"); },
  "finance-customers": async () => { await open("/daily-finance/customers"); },
  statement: async () => {
    await open("/daily-finance/users?account=fa1");
    await page.getByRole("button", { name: "Customer Statement" }).first().click();
    await page.waitForTimeout(1200);
  },
  "bill-scan": async () => {
    const photo = await billPhoto();
    await open("/accounting/transactions");
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await page.getByRole("menuitem", { name: /^Purchase$/ }).click().catch(() => page.getByText("Purchase", { exact: true }).click());
    await page.locator(".acc-bill-scan input[type=file]").waitFor({ timeout: 15000 });
    await page.locator(".acc-bill-scan input[type=file]").setInputFiles(photo);
    await page.locator(".acc-bill-review").waitFor({ timeout: 15000 });
    await scrollToText("Supplier bill", 72);
  },
  receipt: async () => {
    await open("/daily-finance/users?account=fa5");
    await page.locator(".receipt-actions button", { hasText: "View" }).first().click();
    await page.waitForTimeout(1200);
  },
  "accounts-locks": async () => { await open("/accounting/setup"); await scrollToText("Period locking", 16); },
  "accounts-audit": async () => {
    await open("/accounting/setup");
    await page.getByText(/Show \d+ events/).first().click();
    await page.waitForTimeout(800);
    await scrollToText("Audit trail", 16);
  },
  "collection-staff": async () => { await open("/collection-staff"); },
  whatsapp: async () => { await open("/settings/whatsapp"); },
  "chit-scheme": async () => { await open("/chit-fund/schemes/s1/overview"); },
  "chit-members": async () => { await open("/chit-fund/schemes/s1/members"); },
  "chit-bids": async () => { await open("/chit-fund/schemes/s1/bids"); },
  "chit-payments": async () => { await open("/chit-fund/schemes/s1/payments"); },
  "chit-dividends": async () => { await open("/chit-fund/schemes/s1/dividends"); },
  "chit-live": async () => { await open("/chit-fund/schemes/s1/live"); },
  "chit-member": async () => { await open("/chit-fund/schemes/s1/members/e4"); },
  "ai-overview": async () => { await open("/accounting/overview"); await scrollToText("What needs your attention", 64); },
  monthly: async () => { await open("/monthly-finance/todays-collections"); },
  "monthly-reports": async () => { await open("/monthly-finance/reports"); },
  chit: async () => { await open("/chit-fund/schemes"); await page.waitForTimeout(1500); },
  "chit-reports": async () => { await open("/chit-fund/reports"); },
  "chit-health": async () => { await open("/chit-fund/reports"); await clickTab("Scheme health"); },
  cashbook: async () => { await open("/cashbook/cashbook"); await page.getByText("This month", { exact: true }).first().click(); await page.waitForTimeout(800); },
  "accounts-overview": async () => { await open("/accounting/overview"); },
  "accounts-charts": async () => { await open("/accounting/overview"); await scrollToText("Monthly overview", 44); await page.waitForTimeout(1500); },
  accounts: async () => { await open("/accounting/transactions"); },
  "accounts-inventory": async () => { await open("/accounting/inventory"); },
  "bk-overview": async () => { await open("/accounting"); await page.locator(".acc-bk").waitFor({ timeout: 40000 }); await scrollToText("Tell Finny what happened", 90); },
  "bk-laptop": async () => {
    await open("/accounting");
    await page.locator(".acc-bk-form input").fill("I bought a laptop for ₹85,000 using HDFC");
    await page.locator(".acc-bk-form button[type=submit]").click();
    await page.locator(".acc-bk-reply").waitFor({ timeout: 20000 });
    await page.locator(".acc-bk-ledger summary").click();
    await scrollToText("Tell Finny what happened", 20);
    console.log("bk:", (await page.locator(".acc-bk-reply").innerText()).replace(/\n+/g, " | "));
  },
  "bk-modal": async () => {
    await open("/accounting/transactions");
    await page.getByRole("button", { name: "New" }).first().click();
    await page.getByRole("menuitem", { name: "Describe it in words" }).click().catch(() => page.getByText("Describe it in words").click());
    await page.locator(".acc-modal .acc-bk-form input").fill("Sold goods to Sharma Kirana for 18,500 on credit with 5% GST");
    await page.locator(".acc-modal .acc-bk-form button[type=submit]").click();
    await page.locator(".acc-modal .acc-bk-reply").waitFor({ timeout: 20000 });
    console.log("bk:", (await page.locator(".acc-modal .acc-bk-reply").innerText()).replace(/\n+/g, " | "));
  },
  "bk-post": async () => {
    const calls = [];
    await page.route("**/rest/v1/rpc/acc_post_voucher", route => { calls.push(["post", route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("v-new-1") }); });
    await page.route("**/rest/v1/rpc/acc_create_party", route => { calls.push(["party", route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("p-new-1") }); });
    await page.route("**/rest/v1/rpc/acc_set_voucher_due_date", route => { calls.push(["due", route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: "null" }); });
    await open("/accounting");
    await page.locator(".acc-bk-form input").fill("Sold goods to Mohan Electricals for 12,000");
    await page.locator(".acc-bk-form button[type=submit]").click();
    await page.locator(".acc-bk-reply").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Post entry" }).click();
    await page.locator(".acc-bk-posted").waitFor({ timeout: 20000 });
    await scrollToText("Tell Finny what happened", 20);
    for (const [kind, body] of calls) console.log(kind, JSON.stringify(body));
  },
  "ob-start": async () => { await open("/accounting"); await page.locator(".acc-setup .acc-bk-head").waitFor({ timeout: 40000 }); await scrollToText("Set up your books", 90); },
  "ob-plan": async () => {
    await open("/accounting");
    await page.locator(".acc-setup .acc-bk-head").waitFor({ timeout: 40000 });
    await answerSetup();
    await page.locator(".acc-setup-plan").waitFor({ timeout: 20000 });
    await scrollToText("Here is the setup I will create", 220);
    console.log("plan:", (await page.locator(".acc-setup-plan").innerText()).replace(/\n+/g, " | "));
  },
  "ob-apply": async () => {
    const calls = [];
    for (const rpc of ["acc_save_settings", "acc_save_gst_settings", "acc_create_coa", "acc_update_coa", "acc_upsert_item_category", "acc_set_coa_parent"]) {
      await page.route(`**/rest/v1/rpc/${rpc}`, route => { calls.push([rpc, route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rpc === "acc_create_coa" ? `coa-${calls.length}` : null) }); });
    }
    await open("/accounting");
    await page.locator(".acc-setup .acc-bk-head").waitFor({ timeout: 40000 });
    await answerSetup();
    await page.getByRole("button", { name: "Set up my books" }).click();
    await page.getByText("Your books are ready.").waitFor({ timeout: 30000 });
    await scrollToText("Your books are ready.", 160);
    for (const [kind, body] of calls) console.log(kind, JSON.stringify(body));
  },
  "setup-ai-card": async () => {
    await open("/accounting/setup");
    await scrollToText("Set up with AI", 120);
  },
  "ob-rerun": async () => {
    const calls = [];
    for (const rpc of ["acc_save_settings", "acc_save_gst_settings", "acc_create_coa", "acc_update_coa", "acc_upsert_item_category", "acc_set_coa_parent"]) {
      await page.route(`**/rest/v1/rpc/${rpc}`, route => { calls.push([rpc, route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rpc === "acc_create_coa" ? `coa-${calls.length}` : null) }); });
    }
    await open("/accounting/setup");
    await page.getByRole("button", { name: "Start setup" }).click();
    await page.locator(".acc-setup .acc-bk-head").waitFor({ timeout: 40000 });
    console.log("url:", page.url());
    await answerSetup();
    await page.locator(".acc-setup-plan").waitFor({ timeout: 20000 });
    console.log("plan:", (await page.locator(".acc-setup-plan").innerText()).replace(/\n+/g, " | "));
    await page.getByRole("button", { name: "Set up my books" }).click();
    await page.getByText("Your books are ready.").waitFor({ timeout: 30000 });
    await scrollToText("Your books are ready.", 160);
    for (const [kind, body] of calls.filter(([kind]) => kind === "acc_save_settings")) console.log(kind, JSON.stringify(body));
    await page.getByRole("button", { name: "Start using MyFinTracker" }).click();
    await page.waitForTimeout(600);
    console.log("assistant after finish:", await page.locator(".acc-setup .acc-bk-head").count());
  },
  "fill-gaps": async () => {
    const calls = [];
    for (const rpc of ["acc_save_settings", "acc_save_gst_settings", "acc_create_coa", "acc_update_coa", "acc_upsert_item_category", "acc_set_coa_parent"]) {
      await page.route(`**/rest/v1/rpc/${rpc}`, route => { calls.push(rpc); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rpc === "acc_create_coa" ? `coa-${calls.length}` : null) }); });
    }
    await open("/accounting/setup");
    await scrollToText("Set up with AI", 120);
    await page.screenshot({ path: `${out}/setup-ai-card.png` });
    await page.getByRole("button", { name: /^Fill gaps in/ }).click();
    const setup = page.locator(".acc-setup");
    await setup.locator(".acc-bk-head").waitFor({ timeout: 40000 });
    console.log("title:", await setup.locator(".acc-bk-title").innerText());
    console.log("first question:", await setup.locator(".acc-setup-ask.is-current").innerText());
    await setup.locator(".acc-bk-form input").fill("Paper trading", { timeout: 30000 });
    await setup.locator("form.acc-bk-form").evaluate(form => form.requestSubmit(), undefined, { timeout: 30000 });
    await page.waitForTimeout(500);
    for (let i = 0; i < 6 && !(await setup.locator(".acc-setup-plan").count()); i += 1) {
      const ask = await setup.locator(".acc-setup-ask.is-current").innerText();
      console.log("asked:", ask);
      if (await setup.locator("form.acc-bk-form").count()) {
        await setup.locator(".acc-bk-form input").fill("HDFC", { timeout: 30000 });
        await setup.locator("form.acc-bk-form").evaluate(form => form.requestSubmit(), undefined, { timeout: 30000 });
      } else {
        await setup.locator(".acc-setup-answer .acc-bk-chip").first().click({ timeout: 30000 });
      }
      await page.waitForTimeout(500);
    }
    console.log("plan:", (await page.locator(".acc-setup-plan").innerText()).replace(/\n+/g, " | "));
    await scrollToText("Here is the setup I will create", 220);
    await page.screenshot({ path: `${out}/fill-gaps-plan.png` });
    await page.getByRole("button", { name: "Set up my books" }).click();
    await page.getByText("Your books are ready.").waitFor({ timeout: 30000 });
    console.log("rpc calls:", calls.join(", "));
  },
  "new-company": async () => {
    let created = false;
    const calls = [];
    await page.route("**/rest/v1/**", route => {
      const url = route.request().url();
      if (url.includes("/rpc/acc_create_company")) { created = true; calls.push(["create", route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("co2") }); }
      if (url.includes("/rpc/acc_list_companies") && created) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
          { id: "co1", name: "Mahaveer Paper", is_primary: true, books_started_on: "2025-04-01", fy_start_month: 4, status: "active" },
          { id: "co2", name: "Buyyani's Enterprises", is_primary: false, books_started_on: "2026-10-15", fy_start_month: 4, status: "active" },
        ]) });
      }
      if (url.includes("/rpc/acc_save_settings")) { calls.push(["save_settings", route.request().postDataJSON()]); return route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
      if (created && route.request().method() === "GET" && /acc_(vouchers|voucher_lines|parties|items)/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return route.fallback();
    });
    await open("/accounting/setup");
    await page.getByRole("button", { name: "Set up a new company" }).click();
    await page.getByLabel("Company name").fill("Buyyani's Enterprises");
    await page.locator(".modal").getByRole("button", { name: "Create company", exact: true }).click();
    await page.waitForTimeout(3000);
    console.log("url:", page.url());
    const setup = page.locator(".acc-setup");
    await setup.locator(".acc-bk-head").waitFor({ timeout: 40000 });
    console.log("title:", await setup.locator(".acc-bk-title").innerText());
    console.log("first question:", await setup.locator(".acc-setup-ask.is-current").innerText(), "| input:", await setup.locator(".acc-bk-form input").inputValue().catch(() => "?"));
    await scrollToText("Set up your books", 90);
    for (const [kind, body] of calls) console.log(kind, JSON.stringify(body));
  },
  "mig-summary": async () => { await openMigration(); },
  "mig-review": async () => {
    await openMigration();
    await page.getByRole("button", { name: /^Review \d+ exceptions/ }).click();
    await page.locator(".acc-mig-table").waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
  },
  "mig-import": async () => {
    const calls = { coa: 0, party: 0, post: 0 };
    await page.route("**/rest/v1/rpc/acc_create_coa", route => { calls.coa += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(`coa-new-${calls.coa}`) }); });
    await page.route("**/rest/v1/rpc/acc_set_coa_parent", route => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
    await page.route("**/rest/v1/rpc/acc_create_party", route => { calls.party += 1; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(`party-new-${calls.party}`) }); });
    await page.route("**/rest/v1/rpc/acc_post_voucher", route => { calls.post += 1; console.log("post", JSON.stringify(route.request().postDataJSON()).slice(0, 400)); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(`v-new-${calls.post}`) }); });
    await openMigration();
    await page.getByRole("button", { name: "Import into MyFinTracker" }).first().click();
    await page.getByRole("button", { name: "Done" }).waitFor({ timeout: 30000 });
    console.log("calls", JSON.stringify(calls));
    console.log("done:", (await page.locator(".acc-mig-body").innerText()).replace(/\n+/g, " | "));
  },
  "accounts-expenses": async () => { await open("/accounting/expenses"); await page.locator(".acc-exp-stats").waitFor({ timeout: 40000 }); await scrollToText("Track, analyze", 140); await page.waitForTimeout(900); },
  "accounts-expenses-charts": async () => { await open("/accounting/expenses"); await scrollToText("Monthly Expense Trends", 24); await page.waitForTimeout(900); },
  "accounts-expenses-tx": async () => { await open("/accounting/expenses"); await scrollToText("Expense Transactions", 24); await page.waitForTimeout(900); },
  "accounts-expenses-sep": async () => {
    await open("/accounting/expenses");
    await scrollToText("Monthly Expense Trends", 24);
    await page.locator(".acc-exp-plot:visible .acc-exp-hit").nth(5).click();
    await page.getByRole("button", { name: /^Rent/ }).first().click();
    await page.waitForTimeout(800);
    await scrollToText("Track, analyze", 140);
    console.log("range:", await page.locator(".acc-exp-range").innerText());
    console.log("cards:", (await page.locator(".acc-exp-stat").allInnerTexts()).join(" | ").replace(/\n/g, " "));
  },
  "accounts-expenses-hover": async () => {
    await open("/accounting/expenses");
    await scrollToText("Monthly Expense Trends", 24);
    console.log("compare enabled:", await page.locator(".acc-exp-toggle input").isEnabled());
    await page.locator(".acc-exp-plot:visible .acc-exp-hit").nth(5).hover();
    await page.waitForTimeout(500);
    console.log("tip:", await page.locator(".acc-exp-tip").first().innerText().catch(() => "none"));
  },
  "accounts-expenses-lastmonth": async () => {
    await open("/accounting/expenses");
    await page.getByRole("button", { name: "Last month", exact: true }).click();
    await page.waitForTimeout(600);
    console.log("range:", (await page.locator(".acc-exp-range").innerText()).replace(/\n/g, " "));
    console.log("cards:", (await page.locator(".acc-exp-stat").allInnerTexts()).join(" | ").replace(/\n/g, " "));
    await scrollToText("Expense Breakdown by Category", 24);
  },
  "accounts-expenses-bad": async () => {
    await open("/accounting/expenses");
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page.locator(".acc-exp-custom input").first().fill("2026-09-30");
    await page.locator(".acc-exp-custom input").nth(1).fill("2026-09-01");
    await page.waitForTimeout(400);
    console.log("error:", await page.locator(".acc-exp-error").innerText().catch(() => "none"));
    await page.locator(".acc-exp-custom input").first().fill("2026-08-10");
    await page.waitForTimeout(400);
    console.log("custom range:", (await page.locator(".acc-exp-range").innerText()).replace(/\n/g, " "));
  },
  "accounts-expenses-open": async () => {
    await open("/accounting/expenses");
    await scrollToText("Expense Transactions", 24);
    const link = page.locator(".acc-exp-voucher:visible, .acc-exp-row-card:visible").first();
    const label = await link.innerText();
    await link.click();
    await page.waitForTimeout(1200);
    console.log("clicked:", label.replace(/\n/g, " "), "→", page.url(), "search:", await page.locator("input[type=search]").first().inputValue().catch(() => "?"));
  },
  "accounts-arap": async () => { await open("/accounting/overview"); await scrollToText("Receivables & payables", 24); await page.waitForTimeout(1000); },
  "accounts-party": async () => { await open("/accounting/parties/profile/ravi"); await page.locator(".acc-party-profile").waitFor({ timeout: 40000 }); await scrollToText(" profile", 120); await page.waitForTimeout(800); },
  "accounts-party-supplier": async () => { await open("/accounting/parties/profile/sriw"); await page.locator(".acc-party-profile").waitFor({ timeout: 40000 }); await scrollToText("Supplier profile", 120); await page.waitForTimeout(800); },
  "party-click": async () => {
    await open("/accounting/parties/receivables");
    await page.getByRole("button", { name: "Ravi Stores" }).first().click();
    await page.locator(".acc-party-profile").waitFor({ timeout: 20000 });
    console.log("url after click:", page.url());
    await page.getByRole("button", { name: "Party Ledger" }).first().click();
    await page.getByRole("button", { name: "Customer profile" }).first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Customer profile" }).first().click();
    await page.locator(".acc-party-profile").waitFor({ timeout: 20000 });
    console.log("url after ledger profile button:", page.url());
  },
  "accounts-receivables": async () => { await open("/accounting/parties/receivables"); await outstandingOnly(); },
  "accounts-payables": async () => { await open("/accounting/parties/payables"); await outstandingOnly(); },
  "accounts-ledger": async () => {
    await open("/accounting/reports/ledger");
    await page.locator(".accounts-filter-field [role=combobox]").first().click();
    await page.getByRole("option", { name: /HDFC Bank/ }).first().click();
    await page.waitForTimeout(600);
  },
  "accounts-trial": async () => { await open("/accounting/reports/trial"); },
  "accounts-pnl": async () => { await open("/accounting/reports/pnl"); },
  "accounts-balance": async () => { await open("/accounting/reports/balance"); },
  "accounts-cashflow": async () => { await open("/accounting/reports/cashflow"); },
  "accounts-gst": async () => { await open("/accounting/reports/gst"); },
  "accounts-banking": async () => { await open("/accounting/banking"); await scrollToText("Saved statements", 12); },
  "accounts-setup": async () => { await open("/accounting/setup"); },
  "ai-expenses": async () => { await open("/accounting/ai-review"); },
  "ai-cashflow": async () => { await open("/accounting/ai-review"); await aiTab("Cash flow"); },
  "ai-collections": async () => { await open("/accounting/ai-review"); await aiTab("Collections"); },
  "ai-anomalies": async () => { await open("/accounting/ai-review"); await aiTab("Anomalies"); },
  "ai-gst": async () => { await open("/accounting/ai-review"); await aiTab("GST health"); },
  "ai-month-end": async () => { await open("/accounting/ai-review"); await aiTab("Month-end"); },
  "ai-bank": async () => { await open("/accounting/ai-review"); await aiTab("Bank reconciliation"); },
  "ai-inventory": async () => { await open("/accounting/ai-review"); await aiTab("Inventory"); },
  intelligence: async () => {
    await open("/dashboard");
    await page.getByRole("button", { name: /Ask Finny/i }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Who has not paid today?" }).click();
    await page.locator(".ft-ask-answer").waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
  },
};

for (const [name, run] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await run();
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: Boolean(process.env.FULL) });
    console.log("saved", name);
  } catch (err) {
    console.log("FAILED", name, String(err.message || err).split("\n")[0]);
  }
}

if (!only.length || only.includes("credit")) {
  await open("/daily-finance/users?account=fa4");
  await page.locator(".credit-score-card").first().waitFor({ timeout: 15000 }).then(
    () => page.locator(".credit-score-card").first().screenshot({ path: `${out}/credit.png` }).then(() => console.log("saved credit")),
    err => console.log("FAILED credit", String(err.message).split("\n")[0]),
  );
}

if (!only.length || only.includes("portals")) {
  const login = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
  const loginPage = await login.newPage();
  await loginPage.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await loginPage.getByRole("button", { name: "Owner sign in" }).waitFor({ timeout: 20000 });
  await loginPage.locator(".ft-auth-panel").screenshot({ path: `${out}/portals.png` });
  console.log("saved portals");
  await login.close();
}

if (errors.length) console.log("page errors:", [...new Set(errors)].slice(0, 5));
await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 4000))]);
process.exit(0);
