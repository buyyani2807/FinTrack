import { buildVoucherDraftFromEntry } from "../io/voucherCsvImport.js";

const mappingKey = companyId => `ft-bulk-map:${companyId || "default"}`;

/** Remember party name → partyId mappings per company (local only). */
export function loadBulkPartyMappings(companyId) {
  try {
    const raw = localStorage.getItem(mappingKey(companyId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberBulkPartyMapping(companyId, partyName, partyId) {
  if (!partyName || !partyId) return;
  const key = String(partyName).toLowerCase().replace(/\s+/g, " ").trim();
  if (!key) return;
  try {
    const current = loadBulkPartyMappings(companyId);
    current[key] = partyId;
    localStorage.setItem(mappingKey(companyId), JSON.stringify(current));
  } catch {
    /* ignore quota */
  }
}

export function applyBulkPartyMappings(entries = [], companyId = "") {
  const map = loadBulkPartyMappings(companyId);
  if (!Object.keys(map).length) return entries;
  return entries.map(entry => {
    if (entry.partyId || !entry.partyName) return entry;
    const id = map[String(entry.partyName).toLowerCase().replace(/\s+/g, " ").trim()];
    return id ? { ...entry, partyId: id, partyRef: "", warnings: entry.warnings.filter(note => !/Will create /.test(note)) } : entry;
  });
}

/**
 * api: { createParty(party) -> id, postVoucher(payload) -> id }
 */
export async function runBulkVoucherPlan(plan, api, {
  accounts = [],
  company = null,
  today = "",
  createMissingParties = true,
  onProgress = () => {},
  shouldStop = () => false,
} = {}) {
  const selected = (plan.entries || []).filter(entry => entry.selected && entry.status !== "error");
  const partiesNeeded = createMissingParties
    ? (plan.newParties || []).filter(party => selected.some(entry => entry.partyRef === party.ref))
    : [];
  const total = partiesNeeded.length + selected.length;
  const partyIds = new Map();
  const failed = [];
  const done = { parties: 0, vouchers: 0 };
  let step = 0;
  const tick = label => {
    step += 1;
    onProgress({ step, total, label, done: { ...done }, failed: failed.length });
  };

  for (const party of partiesNeeded) {
    if (shouldStop()) return { done, failed, stopped: true };
    try {
      const id = await api.createParty(party);
      partyIds.set(party.ref, id);
      rememberBulkPartyMapping(company?.id, party.name, id);
      done.parties += 1;
    } catch (error) {
      failed.push({ label: `Party ${party.name}`, message: error?.message || "Failed" });
    }
    tick(`Party ${party.name}`);
  }

  for (const entry of selected) {
    if (shouldStop()) return { done, failed, stopped: true };
    try {
      const partyId = entry.partyId || partyIds.get(entry.partyRef) || "";
      if (!partyId) throw new Error(`Party “${entry.partyName}” was not created.`);
      if (entry.partyName) rememberBulkPartyMapping(company?.id, entry.partyName, partyId);
      const draft = buildVoucherDraftFromEntry(
        { ...entry, partyId },
        { accounts, company, today },
      );
      await api.postVoucher({ ...draft, clientRequestId: entry.clientRequestId });
      done.vouchers += 1;
    } catch (error) {
      failed.push({ label: `${entry.label} (${entry.date})`, message: error?.message || "Failed" });
    }
    tick(entry.label);
  }

  return { done, failed, stopped: false };
}
