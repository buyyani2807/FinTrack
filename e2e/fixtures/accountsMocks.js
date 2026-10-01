// Mocked owner session plus a small set of books (one company, a few ledgers,
// parties, vouchers, items and cashbook rows) so Accounts screens render real rows.
import { Buffer } from "node:buffer";

const makeE2eToken = (sub = "e2e-user") => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `${header}.${payload}.e2e`;
};

const coa = (id, code, name, group_type, account_type, opening_balance = 0) => ({
  id, code, name, group_type, account_type, is_system: true, is_active: true, opening_balance,
  opening_side: group_type === "asset" || group_type === "expense" ? "dr" : "cr", parent_id: null,
});
const COA = [
  coa("cash", "1000", "Cash", "asset", "cash", 5000),
  coa("bank", "1010", "HDFC Bank", "asset", "bank", 20000),
  coa("debtors", "1100", "Sundry Debtors", "asset", "receivable"),
  coa("creditors", "2000", "Sundry Creditors", "liability", "payable"),
  coa("capital", "3000", "Capital", "equity", "capital", 25000),
  coa("sales", "4000", "Sales", "income", "sales"),
  coa("purchases", "5000", "Purchases", "expense", "purchase"),
  coa("rent", "5100", "Rent", "expense", "expense"),
];
const coaRef = id => ({ code: COA.find(a => a.id === id).code, name: COA.find(a => a.id === id).name });

const PARTIES = [
  { id: "p1", party_type: "customer", name: "Ravi Stores", phone: "9876543210", email: "", address: "MG Road", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
  { id: "p2", party_type: "supplier", name: "Sri Wholesale", phone: "9876500000", email: "", address: "", gstin: "", state_code: "29", gst_registration: "unregistered", notes: "", is_active: true },
];

const voucher = (id, voucher_type, voucher_number, voucher_date, party_id, narration, due_date = null) => ({
  id, voucher_type, voucher_number, voucher_date, narration, status: "posted", party_id, source_module: null, source_type: null,
  source_transaction_id: null, cancel_reason: null, due_date, settlements: [], created_at: `${voucher_date}T10:00:00Z`, posted_at: `${voucher_date}T10:00:00Z`,
});
const VOUCHERS = [
  voucher("v1", "sales", "S-1", "2026-09-10", "p1", "Credit sale", "2026-09-20"),
  voucher("v2", "receipt", "R-1", "2026-09-15", "p1", "Part payment"),
  voucher("v3", "purchase", "P-1", "2026-09-05", "p2", "Stock purchase", "2026-10-05"),
  voucher("v4", "payment", "PY-1", "2026-09-12", null, "Shop rent"),
];
let lineNo = 0;
const line = (voucher_id, coa_id, debit, credit, party_id = null) => ({
  id: `l${++lineNo}`, voucher_id, line_no: lineNo, coa_id, party_id, debit, credit, description: "", acc_coa: coaRef(coa_id),
});
const LINES = [
  line("v1", "debtors", 12000, 0, "p1"), line("v1", "sales", 0, 12000),
  line("v2", "cash", 4000, 0), line("v2", "debtors", 0, 4000, "p1"),
  line("v3", "purchases", 8000, 0), line("v3", "creditors", 0, 8000, "p2"),
  line("v4", "rent", 3000, 0), line("v4", "bank", 0, 3000),
];

const ITEMS = [
  { id: "it1", item_type: "product", name: "Basmati Rice 25kg", sku: "RICE25", category_id: "cat1", unit: "Bag", description: "", selling_price: 1800, purchase_price: 1500, gst_rate: 5, hsn_sac: "1006", opening_stock: 40, opening_stock_date: "2026-04-01", opening_rate: 1450, reorder_level: 10, is_active: true },
  { id: "it2", item_type: "product", name: "Sunflower Oil 1L", sku: "OIL1", category_id: null, unit: "Nos", description: "", selling_price: 160, purchase_price: 130, gst_rate: 5, hsn_sac: "1512", opening_stock: 3, opening_stock_date: "2026-04-01", opening_rate: 125, reorder_level: 12, is_active: true },
];

const cashEntry = (id, ledger, entry_date, transaction_type, category, description, money_in, money_out) => ({
  id, ledger_account_id: ledger.id, ledger_accounts: { name: ledger.name, account_type: ledger.account_type }, entry_date, entry_time: "10:00:00",
  transaction_type, category, description, money_in, money_out, reference: "", notes: "", source_type: "manual", source_id: null, source_line_key: null,
  customer_id: null, finance_account_id: null, receipt_number: "", payment_mode: "cash", is_editable: true, created_at: `${entry_date}T04:30:00Z`,
});
const LEDGERS = [
  { id: "la-cash", account_type: "cash", name: "Cash in hand", bank_account_last4: "", is_default: true, is_active: true },
  { id: "la-bank", account_type: "bank", name: "HDFC Current", bank_account_last4: "4321", is_default: false, is_active: true },
];

const financeAccount = (n, name, extra, payments, status = "active") => ({
  id: `fa${n}`, customer_id: `c${n}`, customers: { full_name: name, phone: "9876543210", address: "MG Road" }, kind: "daily",
  start_date: "2026-08-20", status, collection_order: n, disbursement_mode: "cash", payments, rate_changes: [],
  customer_portal_credentials: [], created_at: "2026-08-20T09:00:00Z", ...extra,
});
const financePayment = (n, paidOn, total) => ({
  id: `fp${n}`, paid_on: paidOn, mode: "cash", total_amount: total, interest_amount: 0, principal_amount: 0, penalty_amount: 0,
  receipt_number: `R${n}`, created_at: `${paidOn}T10:00:00Z`, profiles: { full_name: "E2E Owner" },
});
const FINANCE_ACCOUNTS = [
  financeAccount(1, "Ravi Kumar", { collection_amount: 12000, disbursed_amount: 10000, daily_collection: 120 }, [financePayment(1, "2026-09-27", 120), financePayment(2, "2026-09-29", 240)]),
  financeAccount(2, "Lakshmi Devi", { collection_amount: 24000, disbursed_amount: 20000, daily_collection: 240 }, [financePayment(3, "2026-09-28", 240)]),
  financeAccount(3, "Suresh Babu", { collection_amount: 6000, disbursed_amount: 5000, daily_collection: 60 }, [financePayment(4, "2026-09-30", 60)]),
];

const restRows = url => {
  if (url.includes("/finance_accounts?")) return FINANCE_ACCOUNTS;
  if (url.includes("/profiles?")) return [{ id: "e2e-user", full_name: "E2E Owner", role: "owner", is_active: true, organizations: { name: "E2E Finance" } }];
  if (url.includes("/acc_settings?")) return [{ company_name: "E2E Traders", fy_start_month: 4, books_started_on: "2026-04-01", integration_enabled: false }];
  if (url.includes("/acc_coa?")) return COA;
  if (url.includes("/acc_parties?")) return PARTIES;
  if (url.includes("/acc_vouchers?")) return VOUCHERS;
  if (url.includes("/acc_voucher_lines?")) return LINES;
  if (url.includes("/acc_items?")) return ITEMS;
  if (url.includes("/acc_item_categories?")) return [{ id: "cat1", name: "Grains", is_active: true }];
  if (url.includes("/acc_bank_statements?")) return [{ id: "bs1", coa_id: "bank", statement_date: "2026-09-30", opening_balance: 20000, closing_balance: 17000, acc_coa: coaRef("bank") }];
  if (url.includes("/acc_bank_statement_lines?")) return [{ id: "bl1", statement_id: "bs1", line_date: "2026-09-12", description: "RENT SEPT", reference: "NEFT1", amount: 3000, direction: "out", matched_voucher_line_id: null, match_status: "unmatched" }];
  if (url.includes("/ledger_accounts?")) return LEDGERS;
  if (url.includes("/cashbook_entries?")) return [
    cashEntry("ce1", LEDGERS[0], "2026-09-30", "manual_in", "Other Income", "Counter sales", 2500, 0),
    cashEntry("ce2", LEDGERS[1], "2026-09-29", "expense", "Rent", "Shop rent", 0, 3000),
  ];
  return [];
};
const rpcResult = name => {
  if (name === "acc_list_companies") return [{ id: "co1", name: "E2E Traders", is_primary: true, books_started_on: "2026-04-01", fy_start_month: 4, status: "active" }];
  if (name === "accounts_access_role") return "owner";
  return [];
};

export async function mockAccountsWorkspace(page) {
  await page.addInitScript(() => {
    // Freeze "today" inside the mocked financial year (FY 2026-27).
    const frozen = new Date("2026-09-30T12:00:00Z").valueOf();
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [frozen])); }
      static now() { return frozen; }
    };
    localStorage.setItem("fintrack-accounts-onboarding-v1:co1", "done");
    sessionStorage.setItem("fintrack-accounts-nav", "expanded");
  });
  await page.route("**/api/auth/session", route => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: makeE2eToken(), expires_in: 3600 }) })
    : route.fulfill({ status: 200, contentType: "application/json", body: "{}" })));
  await page.route("**/rest/v1/**", route => {
    const url = route.request().url();
    const rpc = url.match(/\/rest\/v1\/rpc\/([a-z_0-9]+)/);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rpc ? rpcResult(rpc[1]) : restRows(url)) });
  });
}
