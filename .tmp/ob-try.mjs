import { profileBusiness, parseBankNames, buildSetupPlan, profileReply } from "../src/features/accounts/model/setupAssistant.js";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/features/accounts/model/accountingModel.js";

for (const text of ["Electrical wholesale", "We run a kirana store", "Pharmacy", "IT consulting", "Garment manufacturing unit", "Hardware and paints dealer", "Bakery", "Tuition centre", "Something odd"]) {
  const p = profileBusiness(text);
  console.log(text, "=>", p.industry, "|", p.label, "|", p.categories.join(", "), "|", p.ledgers.join(", "));
  console.log("   ", profileReply(p));
}
for (const t of ["HDFC and SBI", "hdfc, icici bank, Karnataka bank", "Only cash and UPI", "none", "SBI current account & cash"]) console.log(t, "=>", parseBankNames(t));
const accounts = DEFAULT_CHART_OF_ACCOUNTS.map((a, i) => ({ ...a, id: `a${i}`, openingBalance: 0 }));
const plan = buildSetupPlan({ name: "Sri Lakshmi Electricals", business: "Electrical wholesale", products: true, inventory: true, gst: "regular", gstin: "29ABCDE1234F1Z5", credit: true, banks: "HDFC and SBI", start: "2026-04-01" }, { accounts, categories: [{ name: "Lighting" }] });
console.log(JSON.stringify({ ...plan, profile: undefined, renames: plan.renames.map(r => [r.account.name, r.name]) }, null, 1));
