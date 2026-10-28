import { buildVoucherDraftFromEntry } from "../io/voucherCsvImport.js";

export const partyMapKey = (partyType, partyName) => {
  const type = partyType === "supplier" || partyType === "purchase" ? "supplier" : "customer";
  const key = String(partyName || "").toLowerCase().replace(/\s+/g, " ").trim();
  return key ? `${type}|${key}` : "";
};

/** Apply company-shared maps ({ "customer|name": partyId }) onto planned entries. */
export function applyBulkPartyMappings(entries = [], maps = {}) {
  if (!maps || !Object.keys(maps).length) return entries;
  return entries.map(entry => {
    if (entry.partyId || !entry.partyName) return entry;
    const type = entry.kind === "purchase" ? "supplier" : "customer";
    const id = maps[partyMapKey(type, entry.partyName)];
    if (!id) return entry;
    const warnings = (entry.warnings || []).filter(note => !/Will create /.test(note));
    return {
      ...entry,
      partyId: id,
      partyRef: "",
      warnings,
      status: entry.errors?.length ? "error" : (warnings.length ? "warning" : "ready"),
    };
  });
}

/**
 * api: {
 *   createParty(party) -> id,
 *   postVoucher(payload) -> id,
 *   rememberPartyMapping?.({ partyName, partyId, partyType }) -> Promise
 * }
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
  const remember = async (partyName, partyId, partyType) => {
    if (!api.rememberPartyMapping || !partyName || !partyId) return;
    try {
      await api.rememberPartyMapping({ partyName, partyId, partyType });
    } catch {
      /* posting succeeded; mapping sync can retry next import */
    }
  };

  for (const party of partiesNeeded) {
    if (shouldStop()) return { done, failed, stopped: true };
    try {
      const id = await api.createParty(party);
      partyIds.set(party.ref, id);
      await remember(party.name, id, party.partyType);
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
      await remember(entry.partyName, partyId, entry.kind === "purchase" ? "supplier" : "customer");
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
