import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";
import {
  NEW_LEDGER_ID,
  buildBookkeeperDraft,
  combineIntents,
  fieldsFromIntent,
  normalizeEntryIntent,
  parseEntryText,
  readAmount,
  withNewLedger,
  withNewParty,
} from "../src/features/accounts/model/bookkeeper.js";
import {
  applySetupPlan,
  buildSetupPlan,
  nextQuestion,
  normalizeBusinessProfile,
  parseBankNames,
  profileBusiness,
} from "../src/features/accounts/model/setupAssistant.js";
import { readDelimited, readTallyXml, readXlsx, decodeText, excelSerialToIso } from "../src/features/accounts/model/importReaders.js";
import {
  analyzeMigration,
  applyAiSuggestions,
  buildMigrationPlan,
  parseAmount,
  parseDateValue,
  runMigrationPlan,
  stableUuid,
} from "../src/features/accounts/model/migrationAssistant.js";
import { normalizeLedgerSuggestions, parseIntentJson } from "../api/accounts/bookkeeper.js";

const today = "2026-10-15";
const accounts = [...DEFAULT_CHART_OF_ACCOUNTS, { code: "1021", name: "HDFC Bank", groupType: "asset", accountType: "bank" }]
  .map(account => ({ ...account, id: `id${account.code}`, isActive: true, openingBalance: 0 }));
const parties = [
  { id: "p1", name: "Ramesh Traders", partyType: "customer" },
  { id: "p2", name: "Sri Balaji Electricals", partyType: "supplier", gstin: "29ABCDE1234F1Z5" },
];
const company = { id: "c1", name: "Lakshmi Electricals", gstRegistration: "regular", stateCode: "29", booksStartedOn: "2026-04-01" };

const draftFor = (text, ctx = {}) => {
  const intent = parseEntryText(text, { today });
  const fields = fieldsFromIntent(intent, { accounts: ctx.accounts || accounts, parties, today });
  return buildBookkeeperDraft(fields, { accounts: ctx.accounts || accounts, parties, company: ctx.company || company, today });
};
const balanced = draft => draft.lines.reduce((sum, line) => sum + line.debit - line.credit, 0) === 0;
const line = (draft, name) => draft.lines.find(item => item.name === name);

/* ---------------- Bookkeeping assistant ---------------- */

test("reads Indian amounts", () => {
  assert.equal(readAmount("₹85,000"), 85000);
  assert.equal(readAmount("1.2 lakh"), 120000);
  assert.equal(readAmount("Rs 18,500 with 18% GST"), 18500);
  assert.equal(readAmount("85k"), 85000);
  assert.equal(readAmount("2 crore"), 20000000);
});

test("a laptop bought through HDFC is an asset paid from the bank", () => {
  const draft = draftFor("I bought a laptop for ₹85,000 using HDFC");
  assert.equal(draft.ok, true);
  assert.equal(draft.action, "asset_purchase");
  assert.equal(draft.voucherType, "payment");
  assert.equal(line(draft, "Fixed Assets").debit, 85000);
  assert.equal(line(draft, "HDFC Bank").credit, 85000);
  assert.ok(balanced(draft));
  assert.equal(draft.payload.narration, "I bought a laptop for ₹85,000 using HDFC");
});

test("credit stock purchase with GST on top splits input tax and owes the supplier", () => {
  const draft = draftFor("Bought stock for ₹1.2 lakh plus 18% GST on credit from Sri Balaji Electricals");
  assert.equal(draft.ok, true);
  assert.equal(draft.voucherType, "purchase");
  assert.equal(line(draft, "Purchase").debit, 120000);
  assert.equal(line(draft, "Input CGST").debit, 10800);
  assert.equal(line(draft, "Input SGST").debit, 10800);
  assert.equal(line(draft, "Accounts Payable").credit, 141600);
  assert.equal(line(draft, "Accounts Payable").partyId, "p2");
  assert.ok(balanced(draft));
  assert.equal(draft.payload.gstLines.length, 1);
});

test("GST is not added for a company that is not GST registered", () => {
  const draft = draftFor("Bought stock for ₹10,000 plus 18% GST in cash", { company: { ...company, gstRegistration: "unregistered" } });
  assert.equal(draft.ok, true);
  assert.equal(line(draft, "Input CGST"), undefined);
  assert.equal(draft.total, 10000);
});

test("a sale to a new customer is on credit and creates the party on post", () => {
  const draft = draftFor("Sold goods for 12,000 to Mohan Stores");
  assert.equal(draft.ok, true);
  assert.deepEqual(draft.newParty, { name: "Mohan Stores", partyType: "customer" });
  const payload = withNewParty(draft.payload, "p-new");
  assert.equal(payload.lines.find(item => item.debit === 12000).partyId, "p-new");
  assert.equal(payload.partyId, "p-new");
});

test("cash deposited in the bank is a contra entry", () => {
  const draft = draftFor("Deposited ₹50,000 cash in the bank");
  assert.equal(draft.voucherType, "contra");
  assert.equal(line(draft, "Bank").debit, 50000);
  assert.equal(line(draft, "Cash in Hand").credit, 50000);
});

test("owner money in and out are capital and drawings, not income or expense", () => {
  const capital = draftFor("I invested 2 lakh into the business through HDFC");
  assert.equal(line(capital, "Capital").credit, 200000);
  const drawings = draftFor("Took ₹5,000 from cash for home");
  assert.equal(line(drawings, "Drawings").debit, 5000);
});

test("a missing ledger is offered as a new one and filled in when posted", () => {
  const withoutAssets = accounts.filter(account => account.code !== "1300");
  const draft = draftFor("I bought a laptop for ₹85,000 using HDFC", { accounts: withoutAssets });
  assert.equal(draft.ok, true);
  assert.equal(draft.newLedger.name, "Fixed Assets");
  const debit = draft.payload.lines.find(item => item.debit === 85000);
  assert.equal(debit.newLedger, true);
  const payload = withNewLedger(draft.payload, "coa-new");
  assert.equal(payload.lines.find(item => item.debit === 85000).coaId, "coa-new");
  const fields = fieldsFromIntent(parseEntryText("I bought a laptop for ₹85,000 using HDFC", { today }), { accounts: withoutAssets, parties, today });
  assert.equal(fields.ledgerId, NEW_LEDGER_ID);
});

test("the AI reading wins, and local rules fill what it left out", () => {
  const remote = normalizeEntryIntent({ action: "expense", amount: 4320, expenseHint: "Electricity", paidVia: "", text: "Paid power bill" });
  const local = parseEntryText("Paid power bill 4,320 by UPI", { today });
  const combined = combineIntents(remote, local);
  assert.equal(combined.action, "expense");
  assert.equal(combined.amount, 4320);
  assert.equal(combined.paidVia, "upi");
  assert.equal(normalizeEntryIntent({ action: "steal", amount: -5 }).action, "");
});

test("server JSON parsing tolerates code fences", () => {
  assert.deepEqual(parseIntentJson("```json\n{\"action\":\"sale\"}\n```"), { action: "sale" });
  assert.throws(() => parseIntentJson("no json"));
});

/* ---------------- Setup assistant ---------------- */

test("reads the kind of business into an industry and a starting setup", () => {
  const electrical = profileBusiness("Electrical wholesale");
  assert.equal(electrical.industry, "wholesale");
  assert.equal(electrical.sellsOnCredit, true);
  assert.ok(electrical.categories.includes("Wires & Cables"));
  assert.ok(electrical.ledgers.includes("Freight Inward"));
  assert.equal(profileBusiness("We run a pharmacy").industry, "medical");
  assert.equal(profileBusiness("IT consulting").sellsProducts, false);
  assert.equal(profileBusiness("Garment manufacturing unit").industry, "manufacturing");
  assert.equal(profileBusiness("Something odd").known, false);
  assert.deepEqual(profileBusiness("Something odd").ledgers, []);
});

test("AI business profiles are kept to values FinTrack knows", () => {
  const profile = normalizeBusinessProfile({ industry: "spaceships", sellsProducts: true, categories: ["A", "A", "B"], ledgers: [] }, "Drone parts shop");
  assert.ok(["retail", "wholesale", "hardware"].includes(profile.industry));
  assert.deepEqual(profile.categories, ["A", "B"]);
});

test("reads bank names", () => {
  assert.deepEqual(parseBankNames("HDFC and SBI"), ["HDFC Bank", "State Bank of India"]);
  assert.deepEqual(parseBankNames("hdfc, Karnataka bank"), ["HDFC Bank", "Karnataka Bank"]);
  assert.deepEqual(parseBankNames("Only cash and UPI"), []);
});

test("asks GSTIN only when GST registered, and inventory only when selling products", () => {
  assert.equal(nextQuestion({}).id, "name");
  assert.equal(nextQuestion({ name: "A", business: "x", products: false }).id, "gst");
  assert.equal(nextQuestion({ name: "A", business: "x", products: true }).id, "inventory");
  assert.equal(nextQuestion({ name: "A", business: "x", products: false, gst: "unregistered" }).id, "credit");
  assert.equal(nextQuestion({ name: "A", business: "x", products: false, gst: "regular" }).id, "gstin");
});

const setupAnswers = { name: "Lakshmi Electricals", business: "Electrical wholesale", products: true, inventory: true, gst: "regular", gstin: "29AAACR5055K1Z3", credit: true, banks: "HDFC and SBI", start: "2026-04-01" };

test("setup plan adds only what the books do not have", () => {
  const plan = buildSetupPlan(setupAnswers, { accounts, categories: [{ name: "Lighting" }], company: { ...company, gstRegistration: "unregistered", stateCode: "" } });
  assert.equal(plan.company.industry, "wholesale");
  assert.equal(plan.gst.stateCode, "29");
  assert.deepEqual(plan.renames.map(item => [item.account.name, item.name]), [["Bank", "State Bank of India"]]);
  assert.equal(plan.ledgers.filter(item => item.accountType === "bank").length, 0);
  assert.ok(plan.existing.includes("HDFC Bank"));
  assert.ok(plan.ledgers.some(item => item.name === "Freight Inward" && item.groupType === "expense"));
  assert.ok(!plan.categories.includes("Lighting"));
  const codes = [...accounts.map(item => item.code), ...plan.ledgers.map(item => item.code)];
  assert.equal(new Set(codes).size, codes.length);
});

test("an unused generic Bank ledger is renamed instead of adding another", () => {
  const plain = accounts.filter(account => account.code !== "1021");
  const plan = buildSetupPlan({ ...setupAnswers, banks: "HDFC" }, { accounts: plain, company });
  assert.equal(plan.renames.length, 1);
  assert.equal(plan.renames[0].name, "HDFC Bank");
  assert.equal(plan.ledgers.filter(item => item.accountType === "bank").length, 0);
});

test("running setup again on books with entries keeps the books start date", async () => {
  const posted = [{ id: "v1", lines: [] }];
  const started = { ...company, booksStartedOn: "2025-04-01" };
  const withoutStart = { ...setupAnswers };
  delete withoutStart.start;
  assert.equal(nextQuestion(withoutStart).id, "start");
  assert.equal(nextQuestion(withoutStart, { keepStart: true }), null);

  const plan = buildSetupPlan(setupAnswers, { accounts, vouchers: posted, company: started });
  assert.equal(plan.company.booksStartedOn, "2025-04-01");
  assert.match(plan.summary[0].detail, /as before/);
  assert.equal(buildSetupPlan(setupAnswers, { accounts, company: started }).company.booksStartedOn, "2026-04-01");

  let saved = null;
  await applySetupPlan({ ...setupAnswers, name: "Lakshmi Electricals Pvt Ltd" }, { profile: profileBusiness("Electrical wholesale"), company: started, vouchers: posted }, {
    saveCompany: async payload => { saved = payload; },
    saveGst: async () => {},
    loadAccounts: async () => accounts,
    loadCategories: async () => [],
    createLedger: async () => {},
    renameLedger: async () => {},
    createCategory: async () => {},
  });
  assert.equal(saved.booksStartedOn, "2025-04-01");
});

test("filling gaps in an existing company never renames it or changes GST or the start date", async () => {
  const existingCompany = { ...company, name: "Mahaveer Paper", booksStartedOn: "2025-04-01", gstRegistration: "regular", gstin: "29AAACR5055K1Z3", stateCode: "29" };
  assert.equal(nextQuestion({}, { keepCompany: true }).id, "business");
  assert.equal(nextQuestion({ business: "x", products: false, credit: true, banks: "" }, { keepCompany: true }), null);

  const answers = { ...setupAnswers, name: "Buyyani's Enterprises", gst: "unregistered", start: "2026-10-01" };
  const plan = buildSetupPlan(answers, { accounts, company: existingCompany, keepCompany: true });
  assert.equal(plan.company.companyName, "Mahaveer Paper");
  assert.equal(plan.company.booksStartedOn, "2025-04-01");
  assert.equal(plan.gst, null);
  assert.equal(plan.companyChanged, false);
  assert.match(plan.summary[0].detail, /stay as they are/);

  const calls = [];
  await applySetupPlan(answers, { profile: profileBusiness("Electrical wholesale"), company: existingCompany, keepCompany: true }, {
    saveCompany: async payload => calls.push(["company", payload]),
    saveGst: async payload => calls.push(["gst", payload]),
    loadAccounts: async () => accounts,
    loadCategories: async () => [],
    createLedger: async () => {},
    renameLedger: async () => {},
    createCategory: async () => {},
  });
  assert.deepEqual(calls, []);
});

test("a first-time setup says when it renames the company", () => {
  const plan = buildSetupPlan({ ...setupAnswers, name: "Buyyani's Enterprises" }, { accounts, company: { ...company, name: "Mahaveer Paper" } });
  assert.equal(plan.renamedFrom, "Mahaveer Paper");
  assert.match(plan.summary[0].detail, /Renamed from Mahaveer Paper/);
  const same = buildSetupPlan({ ...setupAnswers, name: "Mahaveer Paper" }, { accounts, company: { ...company, name: "Mahaveer Paper", booksStartedOn: "2026-04-01" } });
  assert.equal(same.companyChanged, false);
});

test("applying the setup reloads the books and keeps going past a failed step", async () => {
  const calls = [];
  const result = await applySetupPlan(setupAnswers, { profile: profileBusiness("Electrical wholesale"), company }, {
    saveCompany: async payload => calls.push(["company", payload.companyName]),
    saveGst: async () => calls.push(["gst"]),
    loadAccounts: async () => accounts,
    loadCategories: async () => [],
    createLedger: async ledger => {
      if (ledger.name === "Loading & Unloading") throw new Error("boom");
      calls.push(["ledger", ledger.name]);
    },
    renameLedger: async () => calls.push(["rename"]),
    createCategory: async name => calls.push(["category", name]),
    saveIndustry: industry => calls.push(["industry", industry]),
  });
  assert.equal(result.failed.length, 1);
  assert.ok(calls.some(([kind, name]) => kind === "ledger" && name === "Freight Inward"));
  assert.ok(calls.some(([kind]) => kind === "category"));
  assert.ok(calls.some(([kind, value]) => kind === "industry" && value === "wholesale"));
});

/* ---------------- Readers ---------------- */

test("CSV reader handles quotes, escaped quotes and newlines inside fields", () => {
  const rows = readDelimited("Name,Note\n\"Gupta Traders, Mysuru\",\"Said \"\"hi\"\"\nthen left\"\nB,2\n");
  assert.deepEqual(rows, [["Name", "Note"], ["Gupta Traders, Mysuru", "Said \"hi\"\nthen left"], ["B", "2"]]);
  assert.deepEqual(readDelimited("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("decodes UTF-16 Tally files", () => {
  const text = "<ENVELOPE></ENVELOPE>";
  const bytes = new Uint8Array([0xff, 0xfe, ...Buffer.from(text, "utf16le")]);
  assert.equal(decodeText(bytes), text);
  assert.equal(excelSerialToIso(46143), "2026-05-01");
});

const TALLY = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
<TALLYMESSAGE><GROUP NAME="North Debtors"><PARENT>Sundry Debtors</PARENT></GROUP></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Mohan Electricals"><PARENT>North Debtors</PARENT><OPENINGBALANCE>-45000.00</OPENINGBALANCE><LEDGERMOBILE>9845012345</LEDGERMOBILE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="M/s Mohan Electricals Pvt Ltd"><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>+91 98450 12345</LEDGERMOBILE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Havells India Ltd"><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE>30000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="HDFC Bank A/c"><PARENT>Bank Accounts</PARENT><OPENINGBALANCE>-15000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Sales @ 18%"><PARENT>Sales Accounts</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Output CGST"><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Output SGST"><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="CGST"><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><LEDGER NAME="Capital"><PARENT>Capital Account</PARENT><OPENINGBALANCE>30000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
<TALLYMESSAGE><VOUCHER VCHTYPE="Sales"><DATE>20260415</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>S-1</VOUCHERNUMBER><PARTYLEDGERNAME>Mohan Electricals</PARTYLEDGERNAME>
 <ALLINVENTORYENTRIES.LIST><AMOUNT>10000</AMOUNT><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales @ 18%</LEDGERNAME><AMOUNT>10000.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Mohan Electricals</LEDGERNAME><AMOUNT>-11800.00</AMOUNT><BILLALLOCATIONS.LIST><AMOUNT>-99.00</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output CGST</LEDGERNAME><AMOUNT>900.00</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output SGST</LEDGERNAME><AMOUNT>900.00</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER></TALLYMESSAGE>
<TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><DATE>20260420</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-1</VOUCHERNUMBER><ISCANCELLED>Yes</ISCANCELLED>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Mohan Electricals</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>-100</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER></TALLYMESSAGE>
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;

test("Tally reader resolves groups, signs and invoice allocations", () => {
  const tally = readTallyXml(TALLY);
  const mohan = tally.ledgers.find(ledger => ledger.name === "Mohan Electricals");
  assert.equal(mohan.primaryGroup, "Sundry Debtors");
  assert.equal(mohan.openingBalance, 45000);
  assert.equal(mohan.openingSide, "debit");
  assert.equal(tally.cancelled, 1);
  assert.equal(tally.vouchers.length, 1);
  const lines = tally.vouchers[0].lines;
  assert.deepEqual(lines.map(item => [item.ledger, item.debit, item.credit]), [
    ["Mohan Electricals", 11800, 0],
    ["Output CGST", 0, 900],
    ["Output SGST", 0, 900],
    ["Sales @ 18%", 0, 10000],
  ]);
});

async function makeXlsx(rows) {
  const enc = new TextEncoder();
  const shared = [];
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
    const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
    if (typeof value === "number") return `<c r="${ref}"${c === 0 && r > 0 ? " s=\"1\"" : ""}><v>${value}</v></c>`;
    if (!shared.includes(value)) shared.push(value);
    return `<c r="${ref}" t="s"><v>${shared.indexOf(value)}</v></c>`;
  }).join("")}</row>`).join("");
  const files = {
    "xl/workbook.xml": "<workbook><sheets><sheet name=\"Day Book\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    "xl/_rels/workbook.xml.rels": "<Relationships><Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    "xl/sharedStrings.xml": `<sst>${shared.map(value => `<si><t>${value}</t></si>`).join("")}</sst>`,
    "xl/styles.xml": "<styleSheet><cellXfs><xf numFmtId=\"0\"/><xf numFmtId=\"14\"/></cellXfs></styleSheet>",
  };
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content);
    const deflated = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const nameBytes = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, deflated.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, 8, true);
    dir.setUint32(20, deflated.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, deflated);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + deflated.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
}

test("Excel reader reads shared strings, numbers and date cells", async () => {
  const buffer = await makeXlsx([["Date", "Voucher No", "Ledger", "Debit", "Credit"], [46143, "JV-1", "Electricity", 3200, ""], ["", "JV-1", "HDFC Bank A/c", "", 3200]]);
  const [sheet] = await readXlsx(buffer);
  assert.equal(sheet.name, "Day Book");
  assert.deepEqual(sheet.rows[1], ["2026-05-01", "JV-1", "Electricity", "3200", ""]);
  assert.deepEqual(sheet.rows[2], ["", "JV-1", "HDFC Bank A/c", "", "3200"]);
});

/* ---------------- Migration ---------------- */

test("reads amounts with Dr/Cr and dates in Indian order", () => {
  assert.deepEqual(parseAmount("1,200.50 Dr"), { amount: 1200.5, side: "debit" });
  assert.deepEqual(parseAmount("(500)"), { amount: -500, side: "" });
  assert.equal(parseDateValue("05/04/2026"), "2026-04-05");
  assert.equal(parseDateValue("5-Apr-26"), "2026-04-05");
  assert.equal(parseDateValue("2026-04-05"), "2026-04-05");
  assert.equal(parseDateValue("31/02/2026"), "");
});

const tallyFile = { name: "Tally Masters.xml", kind: "tally", tally: readTallyXml(TALLY) };
const zohoFile = {
  name: "Contacts.csv",
  kind: "sheets",
  sheets: [{ name: "Contacts", rows: readDelimited("Display Name,Contact Type,GST Identification Number (GSTIN),Mobile Phone,Opening Balance\nRamesh Traders,customer,,,5000\nPolycab Wires,vendor,,,\"12,000\"\n") }],
};

test("migration analysis counts, maps, and finds duplicates and exceptions", () => {
  const analysis = analyzeMigration([tallyFile, zohoFile], { accounts, parties });
  assert.equal(analysis.counts.customers, 3);
  assert.equal(analysis.counts.suppliers, 2);
  assert.equal(analysis.counts.duplicates, 1);
  assert.equal(analysis.counts.needsMapping, 1);
  assert.equal(analysis.exceptions, 2);
  assert.ok(analysis.autoMappedPercent > 85 && analysis.autoMappedPercent < 100);
  const byName = name => analysis.ledgers.find(ledger => ledger.name === name);
  assert.equal(byName("Output CGST").suggested.coaId, "id2210");
  assert.equal(byName("Sales @ 18%").suggested.coaId, "id4300");
  assert.equal(byName("HDFC Bank A/c").suggested.coaId, "id1021");
  assert.equal(byName("Capital").suggested.coaId, "id3000");
  assert.equal(byName("Ramesh Traders").existingPartyId, "p1");
  assert.ok(byName("CGST").suggested.confidence < 0.8);
});

test("migration plan merges duplicates, balances openings, and is safe to re-run", () => {
  const analysis = analyzeMigration([tallyFile, zohoFile], { accounts, parties });
  const options = { accounts, parties, booksStartedOn: "2026-04-01", today, companyId: "c1" };
  const plan = buildMigrationPlan(analysis, {}, options);
  assert.deepEqual(plan.newParties.map(party => party.name).sort(), ["Havells India Ltd", "Mohan Electricals", "Polycab Wires"]);
  assert.equal(plan.openingDate, "2026-04-01");
  const opening = plan.openings[0].payload;
  const debit = opening.lines.reduce((sum, item) => sum + item.debit, 0);
  const credit = opening.lines.reduce((sum, item) => sum + item.credit, 0);
  assert.equal(debit, credit);
  assert.ok(opening.lines.some(item => item.partyId === "p1" && item.debit === 5000));
  assert.equal(plan.vouchers.length, 1);
  assert.equal(plan.vouchers[0].payload.voucherType, "sales");
  const again = buildMigrationPlan(analysis, {}, options);
  assert.equal(again.vouchers[0].payload.clientRequestId, plan.vouchers[0].payload.clientRequestId);
  assert.match(plan.vouchers[0].payload.clientRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(stableUuid("a"), stableUuid("b"));

  const separate = buildMigrationPlan(analysis, { separate: new Set(analysis.duplicates.map(group => group.id)) }, options);
  assert.equal(separate.newParties.length, 4);
  const skipped = buildMigrationPlan(analysis, { targets: { "sales 18": "skip" } }, options);
  assert.equal(skipped.vouchers.length, 0);
  assert.equal(skipped.skipped.unmapped, 1);
});

test("AI suggestions only fill ledgers FinTrack was unsure about, with allowed targets", () => {
  const analysis = analyzeMigration([tallyFile], { accounts, parties });
  applyAiSuggestions(analysis, [{ name: "CGST", target: "coa:id1140" }, { name: "Output SGST", target: "skip" }]);
  const byName = name => analysis.ledgers.find(ledger => ledger.name === name);
  assert.equal(byName("CGST").suggested.coaId, "id1140");
  assert.equal(byName("CGST").suggested.ai, true);
  assert.equal(byName("Output SGST").suggested.coaId, "id2211");
  const targets = [{ value: "coa:id1140", label: "Input CGST" }];
  assert.deepEqual(normalizeLedgerSuggestions({ suggestions: [{ name: "CGST", target: "coa:id1140" }, { name: "CGST", target: "coa:evil" }, { name: "Other", target: "coa:id1140" }] }, [{ name: "CGST" }], targets), [{ name: "CGST", target: "coa:id1140" }]);
});

test("running the plan fills created ids into entries and continues past failures", async () => {
  const analysis = analyzeMigration([tallyFile, zohoFile], { accounts, parties });
  const plan = buildMigrationPlan(analysis, {}, { accounts, parties, booksStartedOn: "2026-04-01", today, companyId: "c1" });
  const posted = [];
  let id = 0;
  const result = await runMigrationPlan(plan, {
    createLedger: async () => `coa-${++id}`,
    createParty: async party => {
      if (party.name === "Polycab Wires") throw new Error("duplicate");
      return `party-${++id}`;
    },
    postVoucher: async payload => posted.push(payload),
  });
  assert.deepEqual(result.failed.map(item => item.message), ["duplicate", "A party this entry needs was not created."]);
  assert.equal(result.done.vouchers, 1);
  const sale = posted.find(payload => payload.voucherType === "sales");
  assert.ok(sale.lines.every(item => item.coaId));
  assert.ok(sale.partyId.startsWith("party-"));
  assert.ok(sale.lines.every(item => !("ledgerRef" in item) && !("partyRef" in item)));
});
