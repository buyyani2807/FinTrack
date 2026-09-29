import { parseDelimitedText } from "./bankStatementImport.js";

export const PARTY_TYPES = ["customer", "supplier", "employee", "agent", "other"];

const headerKey = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function parsePartyCsv(text) {
  const { headers, rows } = parseDelimitedText(text);
  if (!headers.length) return [];
  const keys = headers.map(headerKey);
  const column = names => {
    for (const name of names) {
      const exact = keys.indexOf(name);
      if (exact >= 0) return exact;
    }
    for (const name of names) {
      const partial = keys.findIndex(key => key.includes(name));
      if (partial >= 0) return partial;
    }
    return -1;
  };
  const positions = {
    partyType: column(["type", "partytype"]),
    name: column(["name", "partyname"]),
    phone: column(["phone", "mobile"]),
    email: column(["email"]),
    address: column(["address"]),
    gstin: column(["gstin"]),
    notes: column(["notes", "note"]),
  };
  const at = (row, field) => (positions[field] >= 0 ? String(row[positions[field]] || "").trim() : "");
  return rows.map(row => {
    const partyType = at(row, "partyType").toLowerCase();
    return {
      partyType: PARTY_TYPES.includes(partyType) ? partyType : "customer",
      name: at(row, "name"),
      phone: at(row, "phone"),
      email: at(row, "email"),
      address: at(row, "address"),
      gstin: at(row, "gstin"),
      notes: at(row, "notes"),
    };
  }).filter(row => row.name);
}

const nameKey = party => `${party.partyType || "customer"}|${String(party.name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
const phoneKey = party => {
  const digits = String(party.phone || "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `${party.partyType || "customer"}|${digits}` : "";
};

// A row is a duplicate when a party of the same type already has the same
// name or the same 10-digit phone, in the books or earlier in the file.
export function planPartyImport(rows = [], existingParties = []) {
  const seenNames = new Set();
  const seenPhones = new Set();
  for (const party of existingParties) {
    seenNames.add(nameKey(party));
    const phone = phoneKey(party);
    if (phone) seenPhones.add(phone);
  }
  const toCreate = [];
  const duplicates = [];
  for (const row of rows) {
    const name = nameKey(row);
    const phone = phoneKey(row);
    if (seenNames.has(name) || (phone && seenPhones.has(phone))) {
      duplicates.push(row);
      continue;
    }
    seenNames.add(name);
    if (phone) seenPhones.add(phone);
    toCreate.push(row);
  }
  return { toCreate, duplicates };
}
