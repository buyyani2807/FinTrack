import { readFile } from "node:fs/promises";
import { readImportFile } from "../../src/features/accounts/model/importReaders.js";
import { analyzeMigration, buildMigrationPlan, runMigrationPlan } from "../../src/features/accounts/model/migrationAssistant.js";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../../src/features/accounts/model/accountingModel.js";

const fileOf = async name => {
  const data = await readFile(new URL(`./${name}`, import.meta.url));
  return { name, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
};
const files = [];
for (const name of ["tally-export.xml", "zoho-contacts.csv", "bookkeeper-journal.xlsx"]) files.push(await readImportFile(await fileOf(name)));
console.log(JSON.stringify(files.map(f => f.kind === "tally" ? { name: f.name, ledgers: f.tally.ledgers.length, vouchers: f.tally.vouchers.map(v => [v.date, v.type, v.number, v.lines.map(l => `${l.ledger}:${l.debit}/${l.credit}`).join(" | ")]) } : { name: f.name, sheets: f.sheets }), null, 1));
const accounts = DEFAULT_CHART_OF_ACCOUNTS.map((a, i) => ({ ...a, id: `a${a.code}`, openingBalance: 0, isActive: true }));
const parties = [{ id: "p1", name: "Gupta Traders, Mysuru", partyType: "customer" }];
const analysis = analyzeMigration(files, { accounts, parties });
console.log("counts", analysis.counts, "auto%", analysis.autoMappedPercent, "exceptions", analysis.exceptions, "sources", analysis.sources);
for (const l of analysis.ledgers) console.log(" ", l.name.padEnd(32), (l.kind || "").padEnd(10), String(l.suggested.confidence).padEnd(5), JSON.stringify({ ...l.suggested, reason: undefined }), l.openingBalance ? `${l.openingBalance} ${l.openingSide}` : "", l.existingPartyId || "");
console.log("dups", analysis.duplicates);
console.log("invalid", analysis.invalid.map(i => [i.voucher.number, i.reason]));
const plan = buildMigrationPlan(analysis, {}, { accounts, parties, booksStartedOn: "2026-04-01", today: "2026-10-14", companyId: "c1" });
console.log("plan", { openingDate: plan.openingDate, diff: plan.openingDifference, ledgers: plan.newLedgers, parties: plan.newParties.map(p => [p.ref, p.name, p.partyType, p.gstin, p.stateCode]), skipped: plan.skipped });
for (const o of plan.openings) console.log("opening", o.payload.lines.map(l => `${l.coaId || l.ledgerRef}${l.partyRef ? "/" + l.partyRef : ""}${l.partyId ? "/" + l.partyId : ""} ${l.debit}/${l.credit}`).join(" | "));
for (const v of plan.vouchers) console.log("voucher", v.payload.voucherType, v.payload.date, v.payload.clientRequestId, v.payload.lines.map(l => `${l.coaId || l.ledgerRef}${l.partyRef ? "/" + l.partyRef : ""} ${l.debit}/${l.credit}`).join(" | "));
let n = 0;
const result = await runMigrationPlan(plan, {
  createLedger: async () => `coa-${++n}`,
  createParty: async () => `party-${++n}`,
  postVoucher: async payload => { if (payload.lines.some(l => !l.coaId)) throw new Error("missing"); return "v"; },
});
console.log(result);
