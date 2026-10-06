import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { crc32 } from "node:zlib";
import {
  agentHandoverSummary,
  collectionReceiptMessage,
  isoWeekday,
  mapRouteSheet,
  moveInList,
  receivablePositions,
  routeOverview,
  routeRunsOn,
  routeSheetBrand,
  routeSheetView,
  validateCollection,
  weekdaysLabel,
} from "../src/features/accounts/model/routeCollectionsModel.js";
import { addMonths, gstFilingSchedule, gstReturnsForPeriod, monthRange, quarterLabel } from "../src/features/accounts/model/gstCalendar.js";
import { buildGstMonthlyPack } from "../src/features/accounts/model/gstMonthlyPack.js";
import { zipStore } from "../src/features/accounts/io/accountingExport.js";
import { gstinChecksum } from "../src/features/accounts/model/accountingGst.js";
import {
  buildOwnerDailyBrief,
  collectList,
  lastPurchaseByItem,
  ownerBriefShareText,
  payList,
  reorderBySupplier,
  reorderList,
  reorderPurchaseOrderLines,
} from "../src/features/accounts/model/ownerDailyBrief.js";
import { pendingOrderRows } from "../src/features/accounts/model/tradeDocumentModel.js";

const gstin = body => `${body}${gstinChecksum(body)}`;

test("route weekdays: ISO weekday, runs-on and labels", () => {
  assert.equal(isoWeekday("2026-10-01"), 4);
  assert.equal(isoWeekday("2026-10-04"), 7);
  assert.equal(routeRunsOn({ weekdays: [] }, "2026-10-04"), true);
  assert.equal(routeRunsOn({ weekdays: [1, 3, 5] }, "2026-10-01"), false);
  assert.equal(routeRunsOn({ weekdays: [4] }, "2026-10-01"), true);
  assert.equal(weekdaysLabel([]), "Every day");
  assert.equal(weekdaysLabel([1, 2, 3, 4, 5, 6, 7]), "Every day");
  assert.equal(weekdaysLabel([1, 2, 3, 4, 5, 6]), "Mon–Sat");
  assert.equal(weekdaysLabel([3, 1]), "Mon, Wed");
});

const rawSheet = {
  date: "2026-10-01",
  today: "2026-10-01",
  agent_name: "Ravi",
  companies: [{ id: "co1", name: "Sri Traders", upi_id: "sri@upi", upi_payee_name: "Sri Traders" }],
  routes: [
    { id: "r1", company_id: "co1", name: "Market beat", weekdays: [4], notes: "Start at bus stand" },
    { id: "r2", company_id: "co1", name: "Highway beat", weekdays: [1], notes: null },
  ],
  stops: [
    { route_id: "r1", stop_order: 2, party_id: "p2", company_id: "co1", name: "Balaji Stores", phone: "9876500002", outstanding: 1200, overdue: 0 },
    { route_id: "r1", stop_order: 1, party_id: "p1", company_id: "co1", name: "Anand Kirana", phone: "9876500001", outstanding: "5000.50", overdue: "3000", last_paid_on: "2026-09-20" },
    { route_id: "r2", stop_order: 1, party_id: "p3", company_id: "co1", name: "Dhaba", outstanding: 800, overdue: 800 },
  ],
  collections: [
    { voucher_id: "v1", voucher_number: "RCPT-1", date: "2026-10-01", party_id: "p1", company_id: "co1", mode: "cash", amount: 1000 },
    { voucher_id: "v2", voucher_number: "RCPT-2", date: "2026-10-01", party_id: "p1", company_id: "co1", mode: "upi", amount: "500" },
  ],
};

test("route sheet: today's routes in visiting order with collected amounts", () => {
  const sheet = mapRouteSheet(rawSheet);
  assert.equal(sheet.agentName, "Ravi");
  assert.equal(sheet.companies[0].upiId, "sri@upi");
  const view = routeSheetView(sheet);
  assert.deepEqual(view.routes.map(route => [route.id, route.runsToday]), [["r1", true], ["r2", false]]);
  assert.deepEqual(view.stops.map(stop => stop.partyId), ["p1", "p2"]);
  assert.equal(view.stops[0].collected, 1500);
  assert.equal(view.totals.outstanding, 6200.5);
  assert.equal(view.totals.overdue, 3000);
  assert.equal(view.totals.collected, 1500);
  assert.equal(view.totals.visited, 1);
  assert.deepEqual(view.totals.byMode, { cash: 1000, upi: 500, cheque: 0, bank: 0 });
  const highway = routeSheetView(sheet, { routeId: "r2" });
  assert.deepEqual(highway.stops.map(stop => stop.partyId), ["p3"]);
  assert.equal(view.routes[0].dueStops, 2);
  assert.equal(routeSheetBrand(sheet, view, { fallback: "Sudheer Finance" }), "Sri Traders");
  assert.equal(routeSheetBrand(null, null, { fallback: "Sudheer Finance" }), "Sudheer Finance");
});

test("collection validation: amount, mode, reference and outstanding cap", () => {
  assert.match(validateCollection({ amount: "", mode: "cash", outstanding: 100 }), /amount/);
  assert.match(validateCollection({ amount: 50, mode: "card", outstanding: 100 }), /how the customer paid/);
  assert.match(validateCollection({ amount: 50, mode: "cheque", outstanding: 100 }), /cheque number/);
  assert.match(validateCollection({ amount: 150, mode: "cash", outstanding: 100 }), /more than the outstanding/);
  assert.match(validateCollection({ amount: 10, mode: "cash", outstanding: 0 }), /no outstanding/);
  assert.equal(validateCollection({ amount: "100", mode: "cash", outstanding: 100 }), "");
  assert.equal(validateCollection({ amount: 40, mode: "bank", reference: "UTR123", outstanding: 100 }), "");
});

test("collection receipt message has no stray blank lines", () => {
  const message = collectionReceiptMessage({ companyName: "Sri Traders", partyName: "Anand", amount: 1500, mode: "upi", date: "2026-10-01", outstandingAfter: 3500.5 });
  assert.match(message, /Payment received - Sri Traders/);
  assert.match(message, /by UPI/);
  assert.match(message, /Balance due/);
  assert.doesNotMatch(message, /\n\n\n/);
  assert.doesNotMatch(message, /Receipt no/);
  assert.doesNotMatch(message, /Collected by/);
  const full = collectionReceiptMessage({ partyName: "Anand", amount: 100, mode: "cheque", reference: "000123", voucherNumber: "RCPT-9", agentName: "Ravi", date: "2026-10-01" });
  assert.match(full, /Ref 000123/);
  assert.match(full, /Receipt no: RCPT-9/);
  assert.match(full, /Collected by Ravi\./);
});

test("cash handover groups posted field collections by agent and mode", () => {
  const summary = agentHandoverSummary([
    { agentId: "a1", agentName: "Ravi", mode: "cash", amount: 1000, status: "posted" },
    { agentId: "a1", agentName: "Ravi", mode: "upi", amount: 500, status: "posted" },
    { agentId: "a2", agentName: "Sita", mode: "cheque", amount: 2500, status: "posted" },
    { agentId: "a1", agentName: "Ravi", mode: "cash", amount: 700, status: "reversed" },
  ]);
  assert.deepEqual(summary.agents.map(agent => [agent.agentName, agent.count, agent.total]), [["Sita", 1, 2500], ["Ravi", 2, 1500]]);
  assert.equal(summary.totals.total, 4000);
  assert.equal(summary.totals.byMode.cash, 1000);
});

test("owner route overview and list reordering", () => {
  const positions = receivablePositions([
    { partyId: "p1", outstanding: 1000, daysOverdue: 5 },
    { partyId: "p1", outstanding: 500, daysOverdue: 0 },
    { partyId: "p2", outstanding: 0, daysOverdue: 9 },
  ]);
  assert.deepEqual(positions.get("p1"), { outstanding: 1500, overdue: 1000, maxDaysOverdue: 5 });
  assert.equal(positions.has("p2"), false);
  const overview = routeOverview({
    routes: [{ id: "r1", name: "Beat", agentId: "a1", weekdays: [] }],
    stops: [{ routeId: "r1", partyId: "p2", stopOrder: 2 }, { routeId: "r1", partyId: "p1", stopOrder: 1 }],
    parties: [{ id: "p1", name: "Anand" }, { id: "p2", name: "Balaji" }],
    positions,
    agents: [{ id: "a1", name: "Ravi" }],
  });
  assert.deepEqual(overview[0].stops.map(stop => stop.name), ["Anand", "Balaji"]);
  assert.equal(overview[0].outstanding, 1500);
  assert.equal(overview[0].agent.name, "Ravi");
  assert.deepEqual(moveInList(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveInList(["a", "b"], 0, -1), ["a", "b"]);
});

test("GST calendar: monthly, QRMP and composition due dates", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(quarterLabel("2026-12"), "Oct–Dec 2026");
  assert.equal(quarterLabel("2027-02"), "Dec 2026–Feb 2027");

  const monthly = gstReturnsForPeriod("2026-09", { registration: "regular" });
  assert.deepEqual(monthly.map(item => [item.code, item.dueDate]), [["GSTR1", "2026-10-11"], ["GSTR3B", "2026-10-20"]]);
  const december = gstReturnsForPeriod("2026-12", { registration: "regular" });
  assert.equal(december[1].dueDate, "2027-01-20");

  assert.deepEqual(gstReturnsForPeriod("2026-07", { registration: "regular", frequency: "quarterly" }).map(item => [item.code, item.dueDate]), [["PMT06", "2026-08-25"]]);
  const karnataka = gstReturnsForPeriod("2026-09", { registration: "regular", frequency: "quarterly", stateCode: "29" });
  assert.deepEqual(karnataka.map(item => [item.code, item.dueDate]), [["GSTR1", "2026-10-13"], ["GSTR3B", "2026-10-22"]]);
  const delhi = gstReturnsForPeriod("2026-09", { registration: "regular", frequency: "quarterly", stateCode: "07" });
  assert.equal(delhi[1].dueDate, "2026-10-24");

  assert.deepEqual(gstReturnsForPeriod("2026-09", { registration: "composition" }).map(item => [item.code, item.dueDate]), [["CMP08", "2026-10-18"]]);
  assert.deepEqual(gstReturnsForPeriod("2026-08", { registration: "composition" }), []);
  assert.deepEqual(gstReturnsForPeriod("2026-09", { registration: "unregistered" }), []);
});

test("GST filing schedule: pending, overdue and filed", () => {
  const schedule = gstFilingSchedule({
    today: "2026-10-15",
    registration: "regular",
    filings: [{ returnCode: "GSTR1", period: "2026-09", filedOn: "2026-10-10" }],
    since: "2026-08-15",
    lookbackMonths: 3,
  });
  const keyed = Object.fromEntries(schedule.all.map(item => [`${item.code}:${item.period}`, item.status]));
  assert.equal(keyed["GSTR1:2026-09"], "filed");
  assert.equal(keyed["GSTR3B:2026-09"], "due_soon");
  assert.equal(keyed["GSTR1:2026-08"], "overdue");
  assert.equal(keyed["GSTR1:2026-07"], undefined);
  assert.deepEqual(schedule.pending.map(item => `${item.code}:${item.period}`), ["GSTR1:2026-08", "GSTR3B:2026-08", "GSTR3B:2026-09"]);
  assert.equal(schedule.next, null);
  assert.deepEqual(gstFilingSchedule({ today: "2026-10-15", registration: "unregistered" }).pending, []);

  const caughtUp = gstFilingSchedule({
    today: "2026-10-05",
    registration: "regular",
    since: "2026-09-01",
    lookbackMonths: 1,
    filings: [{ returnCode: "GSTR1", period: "2026-09", filedOn: "2026-10-03" }, { returnCode: "GSTR3B", period: "2026-09", filedOn: "2026-10-04" }],
  });
  assert.deepEqual(caughtUp.pending, []);
  assert.equal(caughtUp.next.code, "GSTR1");
  assert.equal(caughtUp.next.period, "2026-10");
});

function readZip(bytes) {
  const buffer = Buffer.from(bytes);
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, "end of central directory present");
  const count = buffer.readUInt16LE(eocd + 10);
  const files = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    const crc = buffer.readUInt32LE(offset + 14);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const data = buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    files.push({ name, text: data.toString("utf8") });
    offset += 30 + nameLength + size;
  }
  return files;
}

const regularCompany = { name: "Sri Traders", gstRegistration: "regular", gstin: gstin("29ABCDE1234F1Z"), stateCode: "29" };
const packParties = [
  { id: "c1", name: "Big Buyer", partyType: "customer", gstin: gstin("29PQRSX6789K1Z"), stateCode: "29" },
  { id: "c2", name: "Walk-in", partyType: "customer", gstin: "", stateCode: "" },
  { id: "c3", name: "Bad GSTIN Co", partyType: "customer", gstin: "29AAAAA0000A1ZX", stateCode: "29" },
  { id: "s1", name: "Unregistered Supplier", partyType: "supplier", gstin: "" },
];
const gstLine = (taxable, rate, hsnSac, extra = {}) => ({ taxable, rate, hsnSac, cgst: taxable * rate / 200, sgst: taxable * rate / 200, igst: 0, itcEligible: true, ...extra });
const packVouchers = [
  { id: "inv1", voucherType: "sales", voucherNumber: "INV-1", date: "2026-09-05", status: "posted", partyId: "c1", lines: [{ debit: 11800, credit: 0 }, { debit: 0, credit: 11800 }], gstLines: [gstLine(10000, 18, "7214")] },
  { id: "inv2", voucherType: "sales", voucherNumber: "INV-2", date: "2026-09-12", status: "posted", partyId: "c2", lines: [{ debit: 1050, credit: 0 }, { debit: 0, credit: 1050 }], gstLines: [gstLine(1000, 5, "")] },
  { id: "inv3", voucherType: "sales", voucherNumber: "INV-3", date: "2026-09-20", status: "posted", partyId: "c3", lines: [{ debit: 500, credit: 0 }, { debit: 0, credit: 500 }], gstLines: [] },
  { id: "inv4", voucherType: "sales", voucherNumber: "INV-4", date: "2026-10-02", status: "posted", partyId: "c1", lines: [{ debit: 999, credit: 0 }, { debit: 0, credit: 999 }], gstLines: [gstLine(847, 18, "7214")] },
  { id: "bill1", voucherType: "purchase", voucherNumber: "PUR-1", date: "2026-09-08", status: "posted", partyId: "s1", lines: [{ debit: 5900, credit: 0 }, { debit: 0, credit: 5900 }], gstLines: [gstLine(5000, 18, "7214")] },
  { id: "draft", voucherType: "sales", voucherNumber: "INV-D", date: "2026-09-25", status: "draft", partyId: "c1", lines: [{ debit: 100, credit: 0 }], gstLines: [gstLine(100, 18, "7214")] },
];

test("monthly GST pack: files, totals, checks and a valid ZIP", () => {
  const pack = buildGstMonthlyPack({
    company: regularCompany,
    period: "2026-09",
    vouchers: packVouchers,
    parties: packParties,
    voucherItemLines: [
      { voucherId: "inv1", itemName: "TMT bar", hsnSac: "7214", unit: "Kg", quantity: 200 },
      { voucherId: "inv4", itemName: "TMT bar", hsnSac: "7214", unit: "Kg", quantity: 15 },
    ],
    generatedAt: "2026-10-01T05:30:00.000Z",
  });
  assert.equal(pack.fileName, "GST-pack-Sri-Traders-2026-09.zip");
  assert.equal(pack.summary.salesCount, 3);
  assert.equal(pack.summary.purchaseCount, 1);
  assert.equal(pack.summary.outwardTaxable, 11000);
  assert.equal(pack.summary.outputTax, 1850);
  assert.equal(pack.summary.eligibleItc, 900);
  assert.equal(pack.summary.netPayable, 950);
  const titles = pack.checks.map(check => check.title).join(" | ");
  assert.match(titles, /1 sales invoice has no GST lines/);
  assert.match(titles, /1 party has an invalid GSTIN/);
  assert.match(titles, /HSN\/SAC missing on 1 invoice/);
  assert.match(titles, /ITC on 1 bill from suppliers without a GSTIN/);
  assert.equal(pack.summary.errors, 1);

  const names = pack.files.map(file => file.name);
  assert.deepEqual(names, [
    "README.txt", "01-Summary.pdf", "02-GSTR-1-prep.csv", "02-GSTR-1-prep.json", "03-GSTR-3B-prep.csv", "03-GSTR-3B-prep.json",
    "04-Sales-register.csv", "05-Purchase-register.csv", "06-HSN-summary.csv", "07-Notes.csv", "08-Day-book.csv", "09-Party-GSTINs.csv", "10-Checks.csv",
  ]);
  const zipped = readZip(zipStore(pack.files));
  assert.deepEqual(zipped.map(file => file.name), names);
  const byName = Object.fromEntries(zipped.map(file => [file.name, file.text]));
  assert.ok(byName["01-Summary.pdf"].startsWith("%PDF-"));
  assert.match(byName["04-Sales-register.csv"], /INV-1,sales,Big Buyer/);
  assert.doesNotMatch(byName["04-Sales-register.csv"], /INV-4|INV-D/);
  assert.match(byName["06-HSN-summary.csv"], /7214,TMT bar,Kg,200,18,10000,900,900,0,1800/);
  const gstr1 = JSON.parse(byName["02-GSTR-1-prep.json"]);
  assert.equal(gstr1.filingStatus, "not_filed");
  assert.equal(gstr1.exportedAt, "2026-10-01T05:30:00.000Z");
  assert.equal(gstr1.b2b.length, 1);
  assert.equal(gstr1.b2c.length, 1);
  assert.match(byName["09-Party-GSTINs.csv"], /Bad GSTIN Co,customer,29AAAAA0000A1ZX,GSTIN checksum is not valid\./);
  assert.match(pack.shareText, /Net GST payable \(calculated\): Rs\. 950\.00/);
});

test("GST pack flags unregistered companies and empty months", () => {
  const pack = buildGstMonthlyPack({ company: { name: "Shop", gstRegistration: "unregistered" }, period: "2026-08", vouchers: packVouchers, parties: packParties });
  assert.equal(pack.checks[0].severity, "error");
  assert.match(pack.checks.map(check => check.title).join(" | "), /No sales or purchases this month/);
  assert.equal(pack.summary.salesCount, 0);
});

test("daily brief: collect overdue and due today, pay within a week", () => {
  const today = "2026-10-01";
  const receivables = [
    { partyId: "c1", partyName: "Anand", partyPhone: "98", outstanding: 3000, dueDate: "2026-09-20", daysOverdue: 11 },
    { partyId: "c1", partyName: "Anand", outstanding: 1000, dueDate: "2026-10-05", daysOverdue: 0 },
    { partyId: "c2", partyName: "Balaji", outstanding: 500, dueDate: "2026-10-01", daysOverdue: 0 },
    { partyId: "c3", partyName: "Later Ltd", outstanding: 900, dueDate: "2026-10-09", daysOverdue: 0 },
    { partyId: "c4", partyName: "Paid", outstanding: 0, dueDate: "2026-09-01", daysOverdue: 0 },
  ];
  const collect = collectList(receivables, today);
  assert.deepEqual(collect.map(row => [row.partyName, row.due, row.outstanding]), [["Anand", 3000, 4000], ["Balaji", 500, 500]]);
  assert.equal(collect[0].maxDaysOverdue, 11);

  const pay = payList([
    { partyId: "s1", partyName: "Steel Co", outstanding: 2000, dueDate: "2026-10-06" },
    { partyId: "s2", partyName: "Cement Co", outstanding: 700, dueDate: "2026-09-28" },
    { partyId: "s3", partyName: "Far Away", outstanding: 100, dueDate: "2026-10-20" },
  ], today);
  assert.deepEqual(pay.map(row => [row.partyName, row.due, row.overdueFlag]), [["Cement Co", 700, true], ["Steel Co", 2000, false]]);
});

test("daily brief: reorder suggestions use stock, open POs and the last purchase", () => {
  const items = [
    { id: "i1", name: "Cement", unit: "Bag", reorderLevel: 50, purchasePrice: 340, gstRate: 28, hsnSac: "2523" },
    { id: "i2", name: "Sand", unit: "Ton", reorderLevel: 10, purchasePrice: 900 },
    { id: "i3", name: "Bricks", unit: "Nos", reorderLevel: 1000 },
    { id: "i4", name: "Labour", itemType: "service", reorderLevel: 5 },
    { id: "i5", name: "Old item", isActive: false, reorderLevel: 5 },
  ];
  const stockByItem = { i1: 20, i2: 4, i3: 5000, i4: 0, i5: 0 };
  const po = { id: "po1", docType: "purchase_order", docNumber: "PO-1", docDate: "2026-09-28", partyId: "s2", status: "open", lines: [{ id: "pl1", itemId: "i2", itemName: "Sand", unit: "Ton", quantity: 20, rate: 900 }] };
  const pendingPurchaseRows = pendingOrderRows({ documents: [po], side: "purchase", today: "2026-10-01" });
  assert.equal(pendingPurchaseRows[0].itemId, "i2");
  const vouchers = [
    { id: "b1", voucherType: "purchase", voucherNumber: "PUR-1", date: "2026-08-01", status: "posted", partyId: "s1", lines: [] },
    { id: "b2", voucherType: "purchase", voucherNumber: "PUR-2", date: "2026-09-10", status: "posted", partyId: "s3", lines: [] },
    { id: "b3", voucherType: "purchase", voucherNumber: "PUR-3", date: "2026-09-15", status: "cancelled", partyId: "s4", lines: [] },
  ];
  const lastPurchase = lastPurchaseByItem([
    { voucherId: "b1", itemId: "i1", rate: 330 },
    { voucherId: "b2", itemId: "i1", rate: 345 },
    { voucherId: "b3", itemId: "i1", rate: 999 },
  ], vouchers);
  assert.deepEqual(lastPurchase.get("i1"), { date: "2026-09-10", voucherNumber: "PUR-2", partyId: "s3", rate: 345 });

  const parties = [{ id: "s3", name: "Cement Depot" }];
  const rows = reorderList({ items, stockByItem, pendingPurchaseRows, lastPurchase, parties });
  assert.deepEqual(rows.map(row => [row.itemName, row.suggested, row.covered]), [["Cement", 80, false], ["Sand", 0, true]]);
  assert.equal(rows[0].supplierName, "Cement Depot");
  assert.equal(rows[0].value, 27600);
  const groups = reorderBySupplier(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].supplierId, "s3");
  const lines = reorderPurchaseOrderLines(groups[0].rows);
  assert.deepEqual(
    { itemId: lines[0].itemId, quantity: lines[0].quantity, rate: lines[0].rate, gstRate: lines[0].gstRate, hsnSac: lines[0].hsnSac },
    { itemId: "i1", quantity: "80", rate: "345", gstRate: "28", hsnSac: "2523" },
  );
});

test("daily brief: file list, totals and share text", () => {
  const gstSchedule = gstFilingSchedule({ today: "2026-10-15", registration: "regular", since: "2026-09-01", lookbackMonths: 1 });
  const brief = buildOwnerDailyBrief({
    today: "2026-10-15",
    receivables: [{ partyId: "c1", partyName: "Anand", outstanding: 3000, dueDate: "2026-10-01", daysOverdue: 14 }],
    payables: [],
    items: [{ id: "i1", name: "Cement", unit: "Bag", reorderLevel: 10 }],
    stockByItem: { i1: 2 },
    gstSchedule,
    unmatchedBankLines: 3,
    periodToLock: { from: "2026-09-01", to: "2026-09-30", label: "Sep 2026" },
  });
  assert.deepEqual(brief.file.map(row => row.kind), ["gst", "gst", "bank", "lock"]);
  assert.equal(brief.file[0].status, "overdue");
  assert.equal(brief.totals.collect, 3000);
  assert.equal(brief.totals.reorder, 1);
  assert.equal(brief.actionCount, 1 + 0 + 1 + 4);
  assert.equal(brief.allClear, false);
  const text = ownerBriefShareText(brief, { companyName: "Sri Traders" });
  assert.match(text, /Daily brief — Sri Traders \(2026-10-15\)/);
  assert.match(text, /Anand: ₹3,000 \(14d late\)/);
  assert.match(text, /Cement: 18 Bag/);
  assert.match(text, /3 bank lines to match/);

  const clear = buildOwnerDailyBrief({ today: "2026-10-15" });
  assert.equal(clear.allClear, true);
});
