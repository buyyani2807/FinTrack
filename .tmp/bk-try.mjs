import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";
import { parseEntryText, fieldsFromIntent, buildBookkeeperDraft } from "../src/features/accounts/model/bookkeeper.js";
const accounts = [...DEFAULT_CHART_OF_ACCOUNTS, { code: "1021", name: "HDFC Bank", groupType: "asset", accountType: "bank" }].map(a => ({ ...a, id: "id" + a.code, isActive: true }));
const parties = [{ id: "p1", name: "Ramesh Traders", partyType: "customer" }, { id: "p2", name: "Sri Balaji Electricals", partyType: "supplier", gstin: "29ABCDE1234F1Z5" }];
const company = { gstRegistration: "regular", stateCode: "29" };
const today = "2026-10-15";
const sentences = process.argv.slice(2).length ? process.argv.slice(2) : [
  "I bought a laptop for ₹85,000 using HDFC",
  "Paid shop rent ₹25,000 by UPI",
  "Sold goods to Ramesh Traders for ₹48,000 on credit",
  "Received ₹20,000 from Ramesh Traders in cash",
  "Deposited ₹50,000 cash in the bank",
  "Bought stock for ₹1.2 lakh plus 18% GST on credit from Sri Balaji Electricals",
  "Paid Sri Balaji Electricals ₹30,000 via NEFT yesterday",
  "Withdrew 10k from HDFC on 3rd October",
  "I invested 2 lakh into the business through HDFC",
  "Took ₹5,000 from cash for home",
  "Got a loan of 5 lakh from SBI",
  "Paid loan EMI 12,500 from HDFC",
  "Received interest 1,250 in HDFC",
  "Bought 2 chairs for 7,000 cash",
  "Paid electricity bill 4,320",
  "Sold goods for 12,000 to Mohan Stores",
  "Mohan deposited 15000 in our HDFC account",
  "Got a new printer for Rs 18,500 with 18% GST from Croma by card",
];
for (const text of sentences) {
  const intent = parseEntryText(text, { today });
  const fields = fieldsFromIntent(intent, { accounts, parties, today });
  const d = buildBookkeeperDraft(fields, { accounts, parties, company, today });
  console.log("\n#", text);
  console.log(" ", intent.action, intent.amount, intent.date || "-", "| via", intent.paidVia, "->", intent.toAccount, "| party", intent.party, "| item", intent.item, "| settle", intent.settlement, "| gst", intent.gstRate, intent.gstIncluded);
  console.log("  ", d.voucherLabel, d.ok ? "OK" : "ERR " + d.errors.join(" "), d.newParty ? "NEW " + JSON.stringify(d.newParty) : "");
  for (const l of d.lines) console.log("     ", l.name.padEnd(22), String(l.debit || "").padStart(9), String(l.credit || "").padStart(9), l.partyId || "");
  for (const e of d.effects) console.log("    +", e);
  for (const n of d.notes) console.log("    ~", n);
}
