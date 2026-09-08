/** Client-side company-isolated Accounts restore. Never cross-company; empty books only. */

import { assertBackupRestorable, parseAccountsCompanyBackup } from "./accountsBackup.js";
import {
  addBankStatement,
  createChartAccount,
  createParty,
  postVoucher,
  saveAccountingSettings,
  saveGstSettings,
  setActiveAccountsCompanyId,
  updateChartAccount,
  upsertItem,
  upsertItemCategory,
} from "./accountingRepository.js";

export { assertBackupRestorable } from "./accountsBackup.js";

/**
 * Restores parties, custom COA, items, vouchers, and bank statements into the matching active company.
 * Remaps IDs; voucher numbers are reassigned by the server.
 */
export async function restoreAccountsCompanyBackup(token, rawBackup, {
  activeCompany,
  existingAccounts = [],
  existingVouchers = [],
  onProgress = () => {},
} = {}) {
  const backup = typeof rawBackup === "string" || rawBackup?.format
    ? (typeof rawBackup === "string" ? parseAccountsCompanyBackup(rawBackup) : rawBackup)
    : parseAccountsCompanyBackup(JSON.stringify(rawBackup));

  assertBackupRestorable(backup, { activeCompany, vouchers: existingVouchers });
  setActiveAccountsCompanyId(activeCompany.id);

  const partyMap = new Map();
  const coaMap = new Map();
  const categoryMap = new Map();
  const itemMap = new Map();

  onProgress("Saving company settings…");
  if (backup.settings) {
    await saveAccountingSettings(token, {
      companyName: activeCompany.name || backup.company.name,
      booksStartedOn: backup.company.booksStartedOn || backup.settings.booksStartedOn,
      fyStartMonth: backup.settings.fyStartMonth || 4,
    }).catch(() => {});
  }
  if (backup.company?.gstRegistration) {
    await saveGstSettings(token, {
      gstRegistration: backup.company.gstRegistration,
      gstin: backup.company.gstin || "",
      legalName: backup.company.legalName || backup.company.name || "",
      stateCode: backup.company.stateCode || "",
    }).catch(() => {});
  }

  onProgress("Matching chart of accounts…");
  const byCode = new Map((existingAccounts || []).map(account => [String(account.code), account]));
  for (const account of backup.accounts || []) {
    const existing = byCode.get(String(account.code));
    if (existing) {
      coaMap.set(account.id, existing.id);
      if (!existing.isSystem && (Number(account.openingBalance || 0) || account.name !== existing.name)) {
        await updateChartAccount(token, {
          id: existing.id,
          code: existing.code,
          name: account.name || existing.name,
          openingBalance: Number(account.openingBalance || 0),
          openingSide: account.openingSide || existing.openingSide || "debit",
          isActive: account.isActive !== false,
          parentId: account.parentId ? coaMap.get(account.parentId) || existing.parentId : existing.parentId,
        }).catch(() => {});
      }
      continue;
    }
    if (account.isSystem) continue;
    const id = await createChartAccount(token, {
      code: account.code,
      name: account.name,
      groupType: account.groupType,
      accountType: account.accountType,
      openingBalance: Number(account.openingBalance || 0),
      openingSide: account.openingSide || "debit",
      parentId: account.parentId ? coaMap.get(account.parentId) || null : null,
    });
    coaMap.set(account.id, id);
    byCode.set(String(account.code), { id, code: account.code });
  }

  onProgress("Restoring parties…");
  for (const party of backup.parties || []) {
    const id = await createParty(token, {
      partyType: party.partyType || "customer",
      name: party.name,
      phone: party.phone || "",
      email: party.email || "",
      address: party.address || "",
      gstin: party.gstin || "",
      stateCode: party.stateCode || "",
      gstRegistration: party.gstRegistration || "",
      notes: party.notes || "",
    });
    partyMap.set(party.id, id);
  }

  onProgress("Restoring items…");
  for (const category of backup.itemCategories || []) {
    const id = await upsertItemCategory(token, { name: category.name });
    if (category.id) categoryMap.set(category.id, id);
  }
  for (const item of backup.items || []) {
    const id = await upsertItem(token, {
      itemType: item.itemType || "product",
      name: item.name,
      sku: item.sku || "",
      categoryId: item.categoryId ? categoryMap.get(item.categoryId) || null : null,
      unit: item.unit || "nos",
      description: item.description || "",
      sellingPrice: item.sellingPrice || 0,
      purchasePrice: item.purchasePrice || 0,
      gstRate: item.gstRate || 0,
      hsnSac: item.hsnSac || "",
      openingStock: item.openingStock || 0,
      openingStockDate: item.openingStockDate || null,
      reorderLevel: item.reorderLevel || 0,
      isActive: item.isActive !== false,
    });
    itemMap.set(item.id, id);
  }

  const vouchers = [...(backup.vouchers || [])].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  onProgress(`Restoring ${vouchers.length} voucher(s)…`);
  for (const voucher of vouchers) {
    if (voucher.status && voucher.status !== "posted") continue;
    const lines = (voucher.lines || [])
      .map(line => ({
        coaId: coaMap.get(line.coaId) || null,
        partyId: line.partyId ? partyMap.get(line.partyId) || null : null,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: line.description || voucher.narration || "",
      }))
      .filter(line => line.coaId);
    if (lines.length < 2) continue;
    await postVoucher(token, {
      voucherType: voucher.voucherType || "journal",
      date: voucher.date,
      dueDate: voucher.dueDate || null,
      narration: voucher.narration || `Restored ${voucher.voucherNumber || ""}`.trim(),
      partyId: voucher.partyId ? partyMap.get(voucher.partyId) || null : null,
      lines,
      gstLines: (voucher.gstLines || []).map(line => ({
        hsnSac: line.hsnSac || "",
        taxable: Number(line.taxable || 0),
        rate: Number(line.rate || 0),
        cgst: Number(line.cgst || 0),
        sgst: Number(line.sgst || 0),
        igst: Number(line.igst || 0),
        itcEligible: Boolean(line.itcEligible),
      })),
      itemLines: (backup.voucherItemLines || [])
        .filter(row => row.voucherId === voucher.id)
        .map(row => ({
          itemId: itemMap.get(row.itemId) || null,
          quantity: Number(row.quantity || 0),
          rate: Number(row.rate || 0),
          amount: Number(row.amount || 0),
        }))
        .filter(row => row.itemId),
    });
  }

  onProgress("Restoring bank statements…");
  for (const statement of backup.statements || []) {
    const coaId = coaMap.get(statement.coaId);
    if (!coaId) continue;
    await addBankStatement(token, {
      coaId,
      statementDate: statement.statementDate,
      openingBalance: Number(statement.openingBalance || 0),
      closingBalance: Number(statement.closingBalance || 0),
      lines: (statement.lines || []).map(line => ({
        lineDate: line.lineDate,
        description: line.description || "",
        amount: Number(line.amount || 0),
        direction: line.direction || "in",
        reference: line.reference || "",
      })),
    });
  }

  onProgress("Restore complete.");
  return {
    parties: partyMap.size,
    accounts: coaMap.size,
    items: itemMap.size,
    vouchers: vouchers.length,
    statements: (backup.statements || []).length,
  };
}
