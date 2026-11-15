// Capture-only demo workspace for marketing screenshots (never committed).
// Layered over e2e/fixtures/accountsMocks.js: tables listed here win, everything else falls back.
import { gstinChecksum } from "../src/features/accounts/model/accountingGst.js";
import { calculateDividend } from "../src/features/chitFund/model/calculations.js";

const gstin = body => `${body}${gstinChecksum(body)}`;
const COMPANY_GSTIN = gstin("29AAKFS4821M1Z");

const coaRow = (id, code, name, group_type, account_type, opening_balance = 0) => ({
  id, code, name, group_type, account_type, is_system: true, is_active: true, opening_balance,
  opening_side: group_type === "asset" || group_type === "expense" ? "debit" : "credit", parent_id: null,
});
const COA = [
  coaRow("cash", "1000", "Cash", "asset", "cash", 40000),
  coaRow("bank", "1020", "HDFC Bank", "asset", "bank", 360000),
  coaRow("debtors", "1100", "Accounts Receivable", "asset", "receivable"),
  coaRow("icgst", "1140", "Input CGST", "asset", "other"),
  coaRow("isgst", "1141", "Input SGST", "asset", "other"),
  coaRow("creditors", "2000", "Accounts Payable", "liability", "payable"),
  coaRow("ocgst", "2210", "Output CGST", "liability", "other"),
  coaRow("osgst", "2211", "Output SGST", "liability", "other"),
  coaRow("capital", "3000", "Capital", "equity", "capital", 400000),
  coaRow("retained", "3200", "Retained Earnings", "equity", "retained"),
  coaRow("sales", "4300", "Sales", "income", "income"),
  coaRow("rent", "5000", "Rent", "expense", "expense"),
  coaRow("salary", "5010", "Salary", "expense", "expense"),
  coaRow("fuel", "5030", "Fuel", "expense", "expense"),
  coaRow("power", "5040", "Electricity", "expense", "expense"),
  coaRow("bankchg", "5100", "Bank Charges", "expense", "expense"),
  coaRow("purchases", "5110", "Purchase", "expense", "expense"),
  coaRow("packing", "5065", "Packing Materials", "expense", "expense"),
];
const coaRef = id => {
  const row = COA.find(account => account.id === id);
  return { code: row.code, name: row.name };
};

const party = (id, party_type, name, phone, extra = {}) => ({
  id, party_type, name, phone, email: "", address: "Bengaluru", gstin: "", state_code: "29", gst_registration: "unregistered",
  notes: "", is_active: true, credit_limit: 0, credit_days: 15, ...extra,
});
const PARTIES = [
  party("ravi", "customer", "Ravi Stores", "9845012345", { gstin: gstin("29AAEPR7123K1Z"), gst_registration: "regular", credit_limit: 150000 }),
  party("anand", "customer", "Anand Supermarket", "9845098765", { gstin: gstin("29AAHFA2231Q1Z"), gst_registration: "regular", credit_limit: 200000 }),
  party("kumar", "customer", "Kumar Kirana", "9731022110", { credit_limit: 100000 }),
  party("lakshmi", "customer", "Lakshmi Provisions", "9900123456", { gstin: gstin("29ABCPL5512D1Z"), gst_registration: "regular", credit_limit: 120000 }),
  party("sriw", "supplier", "Sri Wholesale Traders", "9886001122", { gstin: gstin("29AADFS9081H1Z"), gst_registration: "regular", credit_days: 30 }),
  party("balaji", "supplier", "Balaji Oils", "9886003344", { gstin: gstin("33AAGFB4410C1Z"), state_code: "29", gst_registration: "regular", credit_days: 30 }),
  party("ganesh", "supplier", "Ganesh Packaging", "9886005566", { gstin: "29AAJFG7720K1Z4", gst_registration: "regular", credit_days: 30 }),
];
if (PARTIES[6].gstin === gstin("29AAJFG7720K1Z")) PARTIES[6].gstin = "29AAJFG7720K1Z9";

const ITEMS = [
  { id: "rice", item_type: "product", name: "Sona Masoori Rice 25kg", sku: "RICE25", category_id: "grains", unit: "Bag", description: "", selling_price: 1950, purchase_price: 1500, gst_rate: 5, hsn_sac: "1006", opening_stock: 40, opening_stock_date: "2026-04-01", opening_rate: 1480, reorder_level: 15, is_active: true },
  { id: "oil", item_type: "product", name: "Sunflower Oil 15L Tin", sku: "OIL15", category_id: "oils", unit: "Tin", description: "", selling_price: 2300, purchase_price: 1900, gst_rate: 5, hsn_sac: "1512", opening_stock: 20, opening_stock_date: "2026-04-01", opening_rate: 1880, reorder_level: 10, is_active: true },
  { id: "dal", item_type: "product", name: "Toor Dal 30kg", sku: "DAL30", category_id: "grains", unit: "Bag", description: "", selling_price: 4200, purchase_price: 3600, gst_rate: 5, hsn_sac: "0713", opening_stock: 15, opening_stock_date: "2026-04-01", opening_rate: 3550, reorder_level: 6, is_active: true },
  { id: "sugar", item_type: "product", name: "Sugar 50kg", sku: "SUG50", category_id: "grains", unit: "Bag", description: "", selling_price: 2300, purchase_price: 2000, gst_rate: 5, hsn_sac: "1701", opening_stock: 25, opening_stock_date: "2026-04-01", opening_rate: 1980, reorder_level: 8, is_active: true },
];
const itemById = id => ITEMS.find(item => item.id === id);
const CATEGORIES = [{ id: "grains", name: "Grains & pulses", is_active: true }, { id: "oils", name: "Edible oils", is_active: true }];

const OPENING_MOVES = ITEMS.map(item => ({
  id: `open-${item.id}`, item_id: item.id, movement_date: item.opening_stock_date, quantity_delta: item.opening_stock, reason: "opening",
  note: "Opening stock", voucher_id: null, voucher_item_line_id: null, voucher_number: "", created_at: "2026-04-01T08:00:00Z", document_id: null, document_line_id: null,
}));
const FILINGS = ["04", "05", "06", "07", "08"].flatMap(month => [
  { return_code: "GSTR1", period: `2026-${month}`, filed_on: `2026-${String(Number(month) + 1).padStart(2, "0")}-10`, reference: "" },
  { return_code: "GSTR3B", period: `2026-${month}`, filed_on: `2026-${String(Number(month) + 1).padStart(2, "0")}-18`, reference: "" },
]);

const round2 = value => Math.round(value * 100) / 100;
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

const VOUCHERS = [];
const LINES = [];
const GST_LINES = [];
const ITEM_LINES = [];
const MOVES = [];
const counters = {};
const PREFIX = { sales: "INV", receipt: "RCT", purchase: "PUR", payment: "PAY", journal: "JV" };
let seq = 0;

function post(type, date, partyId, narration, entries, opts = {}) {
  const id = `v${++seq}`;
  counters[type] = (counters[type] || 0) + 1;
  VOUCHERS.push({
    id, voucher_type: type, voucher_number: `${PREFIX[type]}-${String(counters[type]).padStart(4, "0")}`, voucher_date: date,
    narration, status: "posted", party_id: partyId, source_module: null, source_type: null, source_transaction_id: null, cancel_reason: null,
    due_date: opts.due || null, settlements: opts.settlements || [], created_at: opts.createdAt || `${date}T10:30:00Z`, posted_at: opts.createdAt || `${date}T10:30:00Z`,
  });
  entries.forEach(([coaId, debit, credit, linePartyId], index) => LINES.push({
    id: `${id}-l${index + 1}`, voucher_id: id, line_no: index + 1, coa_id: coaId, party_id: linePartyId || null,
    debit: round2(debit), credit: round2(credit), description: "", acc_coa: coaRef(coaId),
  }));
  return id;
}

function tradeLines(voucherId, rows, sign, date, opts = {}) {
  rows.forEach(([itemId, quantity, rate], index) => {
    const item = itemById(itemId);
    const taxable = round2(quantity * rate);
    const half = round2((taxable * item.gst_rate) / 200);
    const lineId = `${voucherId}-i${index + 1}`;
    ITEM_LINES.push({
      id: lineId, voucher_id: voucherId, line_no: index + 1, item_id: itemId, item_name: item.name, item_sku: item.sku, item_type: "product",
      unit: item.unit, quantity, rate, amount: taxable, discount_amount: 0, gst_rate: item.gst_rate, hsn_sac: item.hsn_sac,
      taxable_amount: taxable, cgst_amount: half, sgst_amount: half, igst_amount: 0, source_document_line_id: null,
    });
    const rateOverride = opts.rateOverride?.[itemId];
    GST_LINES.push({
      id: `${voucherId}-g${index + 1}`, voucher_id: voucherId, line_no: index + 1, hsn_sac: opts.blankHsn === itemId ? "" : item.hsn_sac,
      description: item.name, taxable_amount: taxable, rate: rateOverride || item.gst_rate, cgst_amount: half, sgst_amount: half, igst_amount: 0,
      supply_type: "intra", itc_eligible: true,
    });
    MOVES.push({
      id: `${voucherId}-m${index + 1}`, item_id: itemId, movement_date: date, quantity_delta: sign * quantity, reason: sign > 0 ? "purchase" : "sale",
      note: "", voucher_id: voucherId, voucher_item_line_id: lineId, voucher_number: VOUCHERS.at(-1).voucher_number, created_at: `${date}T10:30:00Z`,
      document_id: null, document_line_id: null,
    });
  });
}

const totals = (rows, rateOf) => {
  const taxable = round2(rows.reduce((sum, [itemId, quantity, rate]) => sum + quantity * (rateOf ? rateOf(itemId, rate) : rate), 0));
  const tax = round2(rows.reduce((sum, [itemId, quantity, rate]) => sum + 2 * round2((quantity * rate * itemById(itemId).gst_rate) / 200), 0));
  return { taxable, half: round2(tax / 2), total: round2(taxable + tax) };
};

const invoices = [];
function sale(date, customer, rows, opts = {}) {
  const { taxable, half, total } = totals(rows);
  const id = post("sales", date, customer, opts.narration || "Credit sale", [
    ["debtors", total, 0, customer], ["sales", 0, taxable], ["ocgst", 0, half], ["osgst", 0, half],
  ], { due: addDays(date, 15) });
  tradeLines(id, rows, -1, date, opts);
  invoices.push({ id, date, customer, total });
  return { id, total };
}

const bills = [];
function purchase(date, supplier, rows, opts = {}) {
  const { taxable, half, total } = totals(rows);
  const id = post("purchase", date, supplier, opts.narration || "Stock purchase", [
    ["purchases", taxable, 0], ["icgst", half, 0], ["isgst", half, 0], ["creditors", 0, total, supplier],
  ], { due: addDays(date, 30), createdAt: opts.createdAt });
  tradeLines(id, rows, 1, date, opts);
  bills.push({ id, date, supplier, total });
  return { id, total };
}

function packingBill(date, amount, opts = {}) {
  const tax = round2(amount * 0.18);
  const id = post("purchase", date, "ganesh", opts.narration || "Cartons and tape", [
    ["packing", amount, 0], ["icgst", tax / 2, 0], ["isgst", tax / 2, 0], ["creditors", 0, amount + tax, "ganesh"],
  ], { due: addDays(date, 30) });
  GST_LINES.push({
    id: `${id}-g1`, voucher_id: id, line_no: 1, hsn_sac: "4819", description: "Corrugated cartons", taxable_amount: amount,
    rate: opts.rate || 18, cgst_amount: tax / 2, sgst_amount: tax / 2, igst_amount: 0, supply_type: "intra", itc_eligible: true,
  });
  bills.push({ id, date, supplier: "ganesh", total: amount + tax });
  return { id, total: amount + tax };
}

const receipt = (date, customer, amount, invoiceId, account = "bank") => post("receipt", date, customer, account === "bank" ? "NEFT received" : "Cash received", [
  [account, amount, 0], ["debtors", 0, amount, customer],
], { settlements: invoiceId ? [{ invoice_voucher_id: invoiceId, amount }] : [] });

const supplierPayment = (date, supplier, amount, billId) => post("payment", date, supplier, "Supplier payment", [
  ["creditors", amount, 0, supplier], ["bank", 0, amount],
], { settlements: billId ? [{ invoice_voucher_id: billId, amount }] : [] });

const expense = (date, coaId, amount, narration, account = "bank", opts = {}) => post("payment", date, opts.partyId || null, narration, [
  [coaId, amount, 0], [account, 0, amount],
], { createdAt: opts.createdAt });

// Six months of trading, April to September 2026, "today" is 30 Sep 2026.
const CUSTOMERS = ["ravi", "anand", "kumar", "lakshmi"];
const POWER = [4200, 4500, 4300, 4400, 4600, 7900];
for (let monthIndex = 0; monthIndex < 6; monthIndex += 1) {
  const month = 4 + monthIndex;
  const riceRate = month === 9 ? 1650 : 1500;
  const oilQty = month === 9 ? 8 : 26;
  const stock = purchase(iso(2026, month, 2), "sriw", [["rice", 54, riceRate], ["dal", 18, 3600], ["sugar", 26, 2000]]);
  const oil = purchase(iso(2026, month, 3), "balaji", [["oil", oilQty, 1900]]);
  const packing = packingBill(iso(2026, month, 6), [2300, 2600, 2400, 2500, 2450, 2350][monthIndex]);
  if (month < 9) {
    supplierPayment(iso(2026, month, 24), "sriw", stock.total, stock.id);
    supplierPayment(iso(2026, month, 25), "balaji", oil.total, oil.id);
    supplierPayment(iso(2026, month, 26), "ganesh", packing.total, packing.id);
  }
  expense(iso(2026, month, 1), "salary", 20000, "Staff salary");
  expense(iso(2026, month, 5), "rent", 12000, "Godown rent");
  expense(iso(2026, month, 12), "power", POWER[monthIndex], "BESCOM electricity");
  expense(iso(2026, month, 18), "fuel", 2600 + monthIndex * 120, "Delivery van diesel", "cash");
  expense(iso(2026, month, 28), "bankchg", 118, "Bank charges");
}

// Two invoices a week, rotating customers; most pay within two to three weeks.
const weekStarts = [];
for (let date = "2026-04-06"; date <= "2026-09-28"; date = addDays(date, 7)) weekStarts.push(date);
weekStarts.forEach((monday, week) => {
  [0, 3].forEach((offset, slot) => {
    const date = addDays(monday, offset);
    if (date > "2026-09-30") return;
    const customer = CUSTOMERS[(week * 2 + slot) % CUSTOMERS.length];
    const opts = {};
    if (date === "2026-09-17") opts.blankHsn = "dal";
    const invoice = sale(date, customer, [["rice", 6, 2050], ["oil", 3, 2450], ["dal", 2, 4500], ["sugar", 3, 2450]], opts);
    const unpaidKumar = customer === "kumar" && date >= "2026-08-15";
    const lagDays = (customer === "kumar" ? 22 + (week % 5) * 2 : customer === "anand" ? 15 + (week % 3) : customer === "ravi" ? [11, 13, 19][week % 3] : 18 + (week % 3));
    const paidOn = addDays(date, lagDays);
    if (unpaidKumar || paidOn > "2026-09-30") return;
    if (customer === "ravi" && date >= "2026-09-01") {
      receipt(addDays(date, 10) > "2026-09-30" ? "2026-09-30" : addDays(date, 10), customer, 15000, invoice.id);
      return;
    }
    receipt(paidOn, customer, invoice.total, invoice.id);
  });
});

// Items for the anomaly, GST and bank review screens.
const bigPacking = packingBill("2026-09-26", 9000, { narration: "Festival season cartons" });
supplierPayment("2026-09-22", "ganesh", 4800);
supplierPayment("2026-09-23", "ganesh", 4800);
const rateIssue = post("purchase", "2026-09-15", "ganesh", "Stretch film rolls", [
  ["packing", 5000, 0], ["icgst", 450, 0], ["isgst", 450, 0], ["creditors", 0, 5900, "ganesh"],
], { due: "2026-10-15" });
GST_LINES.push({
  id: `${rateIssue}-g1`, voucher_id: rateIssue, line_no: 1, hsn_sac: "3920", description: "Stretch film", taxable_amount: 5000,
  rate: 12, cgst_amount: 450, sgst_amount: 450, igst_amount: 0, supply_type: "intra", itc_eligible: true,
});
expense("2026-08-14", "fuel", 6400, "Van repair and diesel", "cash", { createdAt: "2026-09-29T18:40:00Z" });
void bigPacking;
if (process.env.BOTH) {
  const back = purchase("2026-09-10", "ravi", [["rice", 4, 1600], ["sugar", 2, 2300]]);
  supplierPayment("2026-09-20", "ravi", 5000, back.id);
}

const BANK_STATEMENT = { id: "bs-sep", coa_id: "bank", statement_date: "2026-09-30", opening_balance: 412500, closing_balance: 389240, acc_coa: coaRef("bank") };
const bankLinesFor = () => {
  const septBank = VOUCHERS.filter(row => row.voucher_date >= "2026-09-01" && LINES.some(line => line.voucher_id === row.id && line.coa_id === "bank"));
  const rows = septBank.slice(0, 18).map((row, index) => {
    const line = LINES.find(item => item.voucher_id === row.id && item.coa_id === "bank");
    const partyName = PARTIES.find(item => item.id === row.party_id)?.name || row.narration;
    const matched = index < 7 || index % 3 === 0;
    return {
      id: `bl${index + 1}`, statement_id: BANK_STATEMENT.id, line_date: row.voucher_date,
      description: `${line.debit ? "NEFT CR" : "NEFT DR"} ${partyName.toUpperCase()}`, reference: `N${2609000 + index}`,
      amount: line.debit || line.credit, direction: line.debit ? "in" : "out",
      matched_voucher_line_id: matched ? line.id : null, match_status: matched ? "matched" : "unmatched",
    };
  });
  rows.push({ id: "bl-chg", statement_id: BANK_STATEMENT.id, line_date: "2026-09-02", description: "CHGS INCL GST AMC DEBIT CARD", reference: "CHG0930", amount: 590, direction: "out", matched_voucher_line_id: null, match_status: "unmatched" });
  rows.push({ id: "bl-upi", statement_id: BANK_STATEMENT.id, line_date: "2026-09-03", description: "UPI/LAKSHMI PROVISIONS/PAYMENT", reference: "UPI88231", amount: 12500, direction: "in", matched_voucher_line_id: null, match_status: "unmatched" });
  return rows.sort((a, b) => a.line_date.localeCompare(b.line_date));
};

const LOCKS = ["04", "05", "06", "07"].map((month, index) => ({
  id: `lock${index + 1}`, period_from: `2026-${month}-01`, period_to: addDays(`2026-${String(Number(month) + 1).padStart(2, "0")}-01`, -1),
  is_locked: true, reopen_reason: null, locked_at: `2026-${String(Number(month) + 1).padStart(2, "0")}-05T09:00:00Z`,
}));

// Daily and monthly finance.
const DAILY = [
  ["Ravi Kumar", 10000, 120, "2026-07-01", [27, 28, 29, 30]],
  ["Lakshmi Devi", 20000, 240, "2026-07-10", [30]],
  ["Suresh Babu", 5000, 60, "2026-08-01", []],
  ["Anjali Reddy", 15000, 180, "2026-07-20", [22, 25, 28, 29, 30]],
  ["Mohammed Irfan", 25000, 300, "2026-06-15", []],
  ["Padma Rao", 8000, 100, "2026-08-10", [29, 30]],
  ["Venkatesh N", 12000, 150, "2026-07-05", []],
  ["Kavitha S", 30000, 360, "2026-06-01", [30]],
];
let paymentSeq = 0;
const COLLECTORS = ["Suresh Agent", "Owner"];
const dailyPayments = (start, perDay, misses) => {
  const payments = [];
  for (let date = start; date <= "2026-09-30"; date = addDays(date, 1)) {
    const day = Number(date.slice(8, 10));
    if (date.startsWith("2026-09") && misses.includes(day)) continue;
    paymentSeq += 1;
    payments.push({
      id: `fp${paymentSeq}`, paid_on: date, mode: paymentSeq % 4 === 0 ? "upi" : "cash", total_amount: perDay, interest_amount: 0, principal_amount: 0,
      penalty_amount: 0, receipt_number: `DR${String(paymentSeq).padStart(5, "0")}`, created_at: `${date}T10:00:00Z`, profiles: { full_name: COLLECTORS[paymentSeq % 2] },
    });
  }
  return payments;
};
const FINANCE_ACCOUNTS = DAILY.map(([name, disbursed, perDay, start, misses], index) => ({
  id: `fa${index + 1}`, customer_id: `c${index + 1}`, customers: { full_name: name, phone: `98450${String(10000 + index * 731).slice(0, 5)}`, address: "Jayanagar, Bengaluru" },
  kind: "daily", start_date: start, status: "active", collection_order: index + 1, disbursement_mode: "cash",
  collection_amount: Math.round(disbursed * 1.2), disbursed_amount: disbursed, daily_collection: perDay,
  payments: dailyPayments(start, perDay, misses), rate_changes: [], customer_portal_credentials: [], created_at: `${start}T09:00:00Z`,
}));
const monthly = (n, name, principal, rate, start, paidMonths) => ({
  id: `fm${n}`, customer_id: `cm${n}`, customers: { full_name: name, phone: "9845077001", address: "Basavanagudi, Bengaluru" }, kind: "monthly",
  start_date: start, status: "active", collection_order: 100 + n, disbursement_mode: "bank", principal, monthly_interest_rate: rate,
  payments: paidMonths.map((month, index) => {
    paymentSeq += 1;
    const interest = Math.round((principal * rate) / 100);
    const day = String(Number(start.slice(8, 10)) + [1, 4, 2, 5, 3][index % 5]).padStart(2, "0");
    return {
      id: `fp${paymentSeq}`, paid_on: `2026-${month}-${day}`, mode: "bank", total_amount: interest, interest_amount: interest, principal_amount: 0, penalty_amount: 0,
      receipt_number: `MR${String(index + 1).padStart(4, "0")}`, created_at: `2026-${month}-${day}T10:00:00Z`, profiles: { full_name: "Owner" },
    };
  }),
  rate_changes: [], customer_portal_credentials: [], created_at: `${start}T09:00:00Z`,
});
FINANCE_ACCOUNTS.push(
  monthly(1, "Meena Traders", 200000, 2, "2026-04-04", ["05", "06", "07", "08", "09"]),
  monthly(2, "Srinivas Motors", 150000, 1.75, "2026-05-02", ["06", "07", "08"]),
  monthly(3, "Harini Textiles", 100000, 2, "2026-06-03", ["07", "08", "09"]),
);

// One auction chit with six months of history.
const CHIT_SCHEME = {
  id: "s1", name: "Gold 2 Lakh · Apr 2026", chit_type: "auction", chit_value: 200000, duration_months: 20, member_count: 20, status: "active",
  installment_amount: 10000, commission_percent: 5, start_date: "2026-04-10", created_at: "2026-03-25T09:00:00Z", auction_day: 10,
};
const MEMBER_NAMES = ["Asha Rao", "Bala Krishna", "Chandra Shekar", "Divya Menon", "Eshwar Prasad", "Farida Khan", "Gopal Reddy", "Hema Latha", "Imran Sheikh", "Jaya Prakash",
  "Kiran Kumar", "Latha Murthy", "Manjunath S", "Nandini Iyer", "Om Prakash", "Pooja Hegde", "Raghavendra", "Savitha N", "Tara Devi", "Umesh Gowda"];
const ENROLLMENTS = MEMBER_NAMES.map((name, index) => ({
  id: `e${index + 1}`, scheme_id: "s1", member_id: `m${index + 1}`, ticket_number: index + 1, status: "active", standing: "good", created_at: "2026-04-01T09:00:00Z",
  chit_members: { full_name: name, phone: `98860${String(20000 + index * 37)}`, address: "Bengaluru" }, chit_member_portal_credentials: [],
}));
const BIDS = [42000, 38000, 36500, 34000, 31000, 29500];
const CYCLES = [];
const CHIT_BIDS = [];
const INSTALLMENTS = [];
for (let cycle = 1; cycle <= 6; cycle += 1) {
  const date = iso(2026, 3 + cycle, 10);
  const done = cycle <= 6;
  const winning = done ? 200000 - BIDS[cycle - 1] : null;
  const split = done ? calculateDividend({ chitValue: 200000, winningBidAmount: winning, commissionPercent: 5, totalMembers: 20 }) : null;
  CYCLES.push({
    id: `cy${cycle}`, scheme_id: "s1", cycle_number: cycle, cycle_date: date, status: done ? "completed" : "scheduled",
    winning_bid_amount: winning, winning_enrollment_id: done ? `e${cycle * 3}` : null,
    discount_amount: done ? split.discount : null, commission_amount: done ? 10000 : null, distributable_amount: done ? split.distributable : null,
    dividend_per_member: done ? (cycle === 5 ? (split.dividendPerMember || 0) + 150 : split.dividendPerMember) : null,
  });
  if (done) {
    [0, 1, 2].forEach(rank => CHIT_BIDS.push({ id: `b${cycle}-${rank}`, cycle_id: `cy${cycle}`, enrollment_id: `e${cycle * 3 - rank}`, bid_amount: BIDS[cycle - 1] - rank * 1500, status: rank === 0 ? "winner" : "outbid", created_at: `${date}T11:00:00Z` }));
  }
  ENROLLMENTS.forEach((enrollment, index) => {
    const due = done ? Math.round(10000 - (split.dividendPerMember || 0)) : 8500;
    let paid = due;
    let paidDate = addDays(date, index % 4);
    if (!done) { paid = 0; paidDate = null; }
    if (done && index === 3) paidDate = addDays(date, [1, 4, 8, 13, 19, 26][cycle - 1]);
    if (done && cycle === 6 && [3, 8, 14].includes(index)) { paid = 0; paidDate = null; }
    if (done && cycle === 5 && index === 8) { paid = Math.round(due / 2); }
    INSTALLMENTS.push({
      id: `in${cycle}-${index + 1}`, cycle_id: `cy${cycle}`, enrollment_id: enrollment.id, scheme_id: "s1", due_date: date, installment_amount: 10000,
      dividend_amount: done ? split.dividendPerMember : 0, net_amount_due: due, amount_paid: paid, paid_date: paidDate,
      status: paid >= due ? "paid" : paid > 0 ? "partial" : "pending", created_at: `${date}T09:00:00Z`,
    });
  });
}

const LEDGERS = [
  { id: "la-cash", account_type: "cash", name: "Cash in hand", bank_account_last4: "", is_default: true, is_active: true },
  { id: "la-upi", account_type: "upi", name: "PhonePe Business", bank_account_last4: "", is_default: false, is_active: true },
  { id: "la-bank", account_type: "bank", name: "HDFC Current", bank_account_last4: "4321", is_default: false, is_active: true },
];
let cashSeq = 0;
const cashEntry = (ledgerId, date, time, transaction_type, category, description, money_in, money_out, extra = {}) => {
  const ledger = LEDGERS.find(row => row.id === ledgerId);
  cashSeq += 1;
  return {
    id: `ce${cashSeq}`, ledger_account_id: ledger.id, ledger_accounts: { name: ledger.name, account_type: ledger.account_type }, entry_date: date, entry_time: time,
    transaction_type, category, description, money_in, money_out, reference: "", notes: "", source_type: extra.source_type || "manual", source_id: null, source_line_key: null,
    customer_id: null, finance_account_id: extra.finance_account_id || null, receipt_number: extra.receipt_number || "", payment_mode: ledger.account_type,
    is_editable: !extra.source_type || extra.source_type === "expense", created_at: `${date}T${time}Z`,
  };
};
const CASHBOOK = [
  cashEntry("la-cash", "2026-09-01", "08:00:00", "opening", "Opening balance", "Opening cash", 48000, 0, { source_type: "opening_balance" }),
  cashEntry("la-upi", "2026-09-01", "08:00:00", "opening", "Opening balance", "Opening UPI", 12500, 0, { source_type: "opening_balance" }),
  cashEntry("la-bank", "2026-09-01", "08:00:00", "opening", "Opening balance", "Opening bank", 285000, 0, { source_type: "opening_balance" }),
];
FINANCE_ACCOUNTS.forEach(account => account.payments.filter(payment => payment.paid_on >= "2026-09-26").forEach(payment => {
  CASHBOOK.push(cashEntry(payment.mode === "upi" ? "la-upi" : payment.mode === "bank" ? "la-bank" : "la-cash", payment.paid_on, "10:15:00", "collection",
    account.kind === "monthly" ? "Monthly Finance" : "Daily Finance", `${account.kind === "monthly" ? "Monthly" : "Daily"} collection · ${account.customers.full_name}`,
    payment.total_amount, 0, { source_type: "finance_payment", finance_account_id: account.id, receipt_number: payment.receipt_number }));
}));
INSTALLMENTS.filter(row => row.paid_date && row.paid_date >= "2026-09-10" && row.amount_paid > 0).slice(0, 8).forEach(row => {
  const member = ENROLLMENTS.find(item => item.id === row.enrollment_id);
  CASHBOOK.push(cashEntry("la-bank", row.paid_date, "11:30:00", "collection", "Chit Fund", `Chit installment · ${member.chit_members.full_name}`, row.amount_paid, 0, { source_type: "chit_auction" }));
});
CASHBOOK.push(
  cashEntry("la-cash", "2026-09-28", "17:20:00", "expense", "Fuel", "Collection bike petrol", 0, 850, { source_type: "expense" }),
  cashEntry("la-cash", "2026-09-29", "18:05:00", "expense", "Agent Commission", "Suresh · September commission", 0, 3200, { source_type: "expense" }),
  cashEntry("la-bank", "2026-09-30", "09:40:00", "expense", "Rent", "Office rent", 0, 9000, { source_type: "expense" }),
  cashEntry("la-cash", "2026-09-30", "19:00:00", "transfer_out", "Transfer", "Cash deposited to HDFC", 0, 20000, { source_type: "transfer" }),
  cashEntry("la-bank", "2026-09-30", "19:00:00", "transfer_in", "Transfer", "Cash deposited to HDFC", 20000, 0, { source_type: "transfer" }),
);

const AUDIT = [
  { id: "au1", entity_type: "period_lock", entity_id: "lock4", action: "lock", actor_id: "e2e-user", old_value: null, new_value: { from: "2026-07-01", to: "2026-07-31" }, reason: "July returns filed", created_at: "2026-08-05T09:00:00Z" },
  { id: "au2", entity_type: "party", entity_id: "kumar", action: "update", actor_id: "e2e-user", old_value: { credit_limit: 80000 }, new_value: { credit_limit: 100000 }, reason: "Credit review", created_at: "2026-09-02T11:20:00Z" },
  { id: "au3", entity_type: "voucher", entity_id: "v40", action: "cancel", actor_id: "e2e-user", old_value: { status: "posted" }, new_value: { status: "cancelled" }, reason: "Entered twice", created_at: "2026-09-18T15:42:00Z" },
  { id: "au4", entity_type: "coa", entity_id: "packing", action: "create", actor_id: "e2e-user", old_value: null, new_value: { code: "5065", name: "Packing Materials" }, reason: "", created_at: "2026-04-03T10:05:00Z" },
  { id: "au5", entity_type: "settings", entity_id: "co1", action: "update", actor_id: "e2e-user", old_value: { gst_registration: "unregistered" }, new_value: { gst_registration: "regular" }, reason: "GST registration received", created_at: "2026-04-01T09:30:00Z" },
].sort((a, b) => b.created_at.localeCompare(a.created_at));

export const COMPANY = {
  id: "co1", name: "Sri Lakshmi Traders", is_primary: true, books_started_on: "2026-04-01", fy_start_month: 4, status: "active",
  gst_registration: "regular", gstin: COMPANY_GSTIN, legal_name: "Sri Lakshmi Traders", state_code: "29", state_name: "Karnataka",
};

export function richRows(url) {
  if (url.includes("/profiles?")) return [{ id: "e2e-user", full_name: "Sanjay Kumar", role: "owner", is_active: true, organizations: { name: "Sri Lakshmi Finance" } }];
  if (url.includes("/finance_accounts?")) return FINANCE_ACCOUNTS;
  if (url.includes("/chit_schemes?")) return [CHIT_SCHEME];
  if (url.includes("/chit_enrollments?")) return ENROLLMENTS;
  if (url.includes("/chit_cycles?")) return CYCLES;
  if (url.includes("/chit_bids?")) return CHIT_BIDS;
  if (url.includes("/chit_installments?")) return INSTALLMENTS;
  if (url.includes("/chit_members?")) return ENROLLMENTS.map(row => ({ id: row.member_id, full_name: row.chit_members.full_name, phone: row.chit_members.phone, address: "Bengaluru" }));
  if (url.includes("/ledger_accounts?")) return LEDGERS;
  if (url.includes("/cashbook_entries?")) return [...CASHBOOK].sort((a, b) => (b.entry_date + b.entry_time).localeCompare(a.entry_date + a.entry_time));
  if (url.includes("/acc_settings?")) return [{ company_name: "Sri Lakshmi Traders", fy_start_month: 4, books_started_on: "2026-04-01", integration_enabled: true }];
  if (url.includes("/acc_coa?")) return COA;
  if (url.includes("/acc_parties?")) return PARTIES;
  if (url.includes("/acc_vouchers?")) return [...VOUCHERS].sort((a, b) => (b.voucher_date + b.voucher_number).localeCompare(a.voucher_date + a.voucher_number));
  if (url.includes("/acc_voucher_lines?")) return LINES;
  if (url.includes("/acc_gst_lines?")) return GST_LINES;
  if (url.includes("/acc_voucher_item_lines?")) return ITEM_LINES;
  if (url.includes("/acc_stock_movements?")) return [...OPENING_MOVES, ...MOVES].sort((a, b) => b.movement_date.localeCompare(a.movement_date));
  if (url.includes("/acc_compliance_filings?")) return FILINGS;
  if (url.includes("/acc_audit_log?")) return AUDIT;
  if (url.includes("/acc_items?")) return ITEMS;
  if (url.includes("/acc_item_categories?")) return CATEGORIES;
  if (url.includes("/acc_inventory_settings?")) return [{ allow_negative_stock: false }];
  if (url.includes("/acc_period_locks?")) return LOCKS;
  if (url.includes("/acc_bank_statements?")) return [BANK_STATEMENT];
  if (url.includes("/acc_bank_statement_lines?")) return bankLinesFor();
  return undefined;
}

export function richRpc(name) {
  if (name === "acc_list_companies") return [COMPANY];
  return undefined;
}

export const DEBUG = { VOUCHERS, LINES, GST_LINES, ITEM_LINES, MOVES, PARTIES, COA, ITEMS, LOCKS, INSTALLMENTS, CYCLES, ENROLLMENTS, FINANCE_ACCOUNTS };
