import { supabase } from "../../lib/supabase";
import { groupByKey } from "./accountsList.js";
import { assembleVouchers } from "./accountsVoucherAssembly.js";

export { assembleVouchers };

const isMissing = err => /could not find|does not exist|schema cache|404|PGRST202/i.test(String(err?.message || err?.code || ""));

let activeCompanyId = null;

export const setActiveAccountsCompanyId = id => {
  activeCompanyId = id || null;
};

export const getActiveAccountsCompanyId = () => activeCompanyId;

const companyHeaders = () => (activeCompanyId ? { "x-acc-company-id": activeCompanyId } : {});
const companyEq = () => (activeCompanyId ? `&company_id=eq.${encodeURIComponent(activeCompanyId)}` : "");
const accOpts = () => ({
  headers: companyHeaders(),
  signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(45000) : undefined,
});
const accRpc = (name, args, token) => supabase.rpc(name, { ...args, ...(activeCompanyId ? { input_company_id: activeCompanyId } : {}) }, token, companyHeaders());
const accQuery = (path, token) => supabase.query(path, token, accOpts());

const wrap = promise => promise.catch(err => {
  if (isMissing(err)) {
    const error = new Error("Run migrations 052–072 in the Supabase SQL editor to enable FinTrack Accounts companies, GST, attachments, items, and QA hardening.");
    error.code = "MIGRATION_REQUIRED";
    throw error;
  }
  throw err;
});

const ignoreMissing = promise => promise.catch(err => {
  if (isMissing(err)) return null;
  throw err;
});

const mapCoa = row => ({
  id: row.id,
  code: row.code,
  name: row.name,
  groupType: row.group_type,
  accountType: row.account_type,
  isSystem: row.is_system,
  isActive: row.is_active,
  openingBalance: Number(row.opening_balance || 0),
  openingSide: row.opening_side,
  parentId: row.parent_id || null,
});

const mapParty = row => ({
  id: row.id,
  partyType: row.party_type,
  name: row.name,
  phone: row.phone || "",
  email: row.email || "",
  address: row.address || "",
  gstin: row.gstin || "",
  stateCode: row.state_code || "",
  gstRegistration: row.gst_registration || "",
  notes: row.notes || "",
  isActive: row.is_active,
});

const mapCompany = row => ({
  id: row.id,
  name: row.name || "",
  fyStartMonth: Number(row.fyStartMonth || row.fy_start_month || 4),
  booksStartedOn: row.booksStartedOn || row.books_started_on || "",
  status: row.status || "active",
  isPrimary: Boolean(row.isPrimary ?? row.is_primary),
  createdAt: row.createdAt || row.created_at,
  updatedAt: row.updatedAt || row.updated_at,
  gstRegistration: row.gstRegistration || row.gst_registration || "unregistered",
  gstin: row.gstin || "",
  legalName: row.legalName || row.legal_name || "",
  stateCode: row.stateCode || row.state_code || "",
  stateName: row.stateName || row.state_name || "",
});

export const loadAccountsCompanies = token => wrap(
  supabase.rpc("acc_list_companies", {}, token).then(rows => {
    let list = rows;
    if (typeof list === "string") {
      try { list = JSON.parse(list); } catch { list = []; }
    }
    return (Array.isArray(list) ? list : []).map(mapCompany);
  }),
);

export const createAccountsCompany = (token, payload) =>
  wrap(supabase.rpc("acc_create_company", {
    input_name: payload.name,
    input_books_started_on: payload.booksStartedOn || null,
    input_fy_start_month: payload.fyStartMonth || 4,
  }, token));

export const archiveAccountsCompany = (token, id, reason) =>
  wrap(supabase.rpc("acc_archive_company", {
    input_company_id: id,
    input_reason: reason || null,
  }, token));

export const loadAccountingSettings = token => wrap(
  accQuery("/rest/v1/acc_settings?select=company_name,fy_start_month,books_started_on,integration_enabled&limit=1", token)
    .then(rows => rows[0] ? {
      companyName: rows[0].company_name || "",
      fyStartMonth: Number(rows[0].fy_start_month || 4),
      booksStartedOn: rows[0].books_started_on || "",
      integrationEnabled: Boolean(rows[0].integration_enabled),
    } : null),
);

export const loadChartOfAccounts = token => wrap(
  accQuery(`/rest/v1/acc_coa?select=id,code,name,group_type,account_type,is_system,is_active,opening_balance,opening_side,parent_id&order=code.asc${companyEq()}`, token).then(rows => rows.map(mapCoa)),
);

export const loadParties = token => wrap(
  accQuery(`/rest/v1/acc_parties?select=id,party_type,name,phone,email,address,gstin,state_code,gst_registration,notes,is_active&order=name.asc${companyEq()}`, token).then(rows => rows.map(mapParty)),
);

export const loadVouchers = token => wrap(
  Promise.all([
    accQuery(`/rest/v1/acc_vouchers?select=id,voucher_type,voucher_number,voucher_date,narration,status,party_id,source_module,source_type,source_transaction_id,cancel_reason,due_date,created_at,posted_at&order=voucher_date.desc,voucher_number.desc&limit=2000${companyEq()}`, token),
    accQuery(`/rest/v1/acc_voucher_lines?select=id,voucher_id,line_no,coa_id,party_id,debit,credit,description,acc_coa(code,name)&order=line_no.asc&limit=20000${companyEq()}`, token),
    accQuery(`/rest/v1/acc_gst_lines?select=id,voucher_id,line_no,hsn_sac,description,taxable_amount,rate,cgst_amount,sgst_amount,igst_amount,supply_type,itc_eligible&order=line_no.asc&limit=20000${companyEq()}`, token).catch(() => []),
  ]).then(([vouchers, lines, gstLines]) => assembleVouchers(vouchers, lines, gstLines || [])),
);

export const loadAuditLog = token => wrap(
  accQuery(`/rest/v1/acc_audit_log?select=id,entity_type,entity_id,action,actor_id,old_value,new_value,reason,created_at&order=created_at.desc&limit=300${companyEq()}`, token)
    .then(rows => rows.map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      actorId: row.actor_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason || "",
      createdAt: row.created_at,
    }))),
);

export const loadPeriodLocks = token => wrap(
  accQuery(`/rest/v1/acc_period_locks?select=id,period_from,period_to,is_locked,reopen_reason,locked_at&order=period_from.desc${companyEq()}`, token)
    .then(rows => rows.map(row => ({
      id: row.id,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      isLocked: row.is_locked,
      reopenReason: row.reopen_reason || "",
      lockedAt: row.locked_at,
    }))),
);

export const loadBankStatements = token => wrap(
  Promise.all([
    accQuery(`/rest/v1/acc_bank_statements?select=id,coa_id,statement_date,opening_balance,closing_balance,acc_coa(name,code)&order=statement_date.desc${companyEq()}`, token),
    accQuery(`/rest/v1/acc_bank_statement_lines?select=id,statement_id,line_date,description,reference,amount,direction,matched_voucher_line_id,match_status&order=line_date.asc${companyEq()}`, token)
      .catch(err => {
        if (!isMissing(err) && !/reference/i.test(String(err?.message || ""))) throw err;
        return accQuery(`/rest/v1/acc_bank_statement_lines?select=id,statement_id,line_date,description,amount,direction,matched_voucher_line_id,match_status&order=line_date.asc${companyEq()}`, token);
      }),
  ]).then(([statements, lines]) => {
    const linesBy = groupByKey(lines, "statement_id");
    return statements.map(row => ({
      id: row.id,
      coaId: row.coa_id,
      accountName: row.acc_coa?.name || "",
      statementDate: row.statement_date,
      openingBalance: Number(row.opening_balance || 0),
      closingBalance: Number(row.closing_balance || 0),
      lines: (linesBy.get(row.id) || []).map(line => ({
        id: line.id,
        lineDate: line.line_date,
        description: line.description,
        ...(line.reference != null ? { reference: line.reference || "" } : {}),
        amount: Number(line.amount || 0),
        direction: line.direction,
        matchedVoucherLineId: line.matched_voucher_line_id,
        matchStatus: line.match_status,
      })),
    }));
  }),
);

export const initializeAccounting = (token, { companyName, booksStartedOn } = {}) =>
  wrap(supabase.rpc("acc_initialize", {
    input_company_name: companyName || null,
    input_books_started_on: booksStartedOn || null,
  }, token));

export const saveAccountingSettings = (token, payload) =>
  wrap(accRpc("acc_save_settings", {
    input_company_name: payload.companyName || null,
    input_fy_start_month: payload.fyStartMonth || 4,
    input_books_started_on: payload.booksStartedOn || null,
  }, token));

export const saveGstSettings = (token, payload) =>
  wrap(accRpc("acc_save_gst_settings", {
    input_gst_registration: payload.gstRegistration || "unregistered",
    input_gstin: payload.gstin || null,
    input_legal_name: payload.legalName || null,
    input_state_code: payload.stateCode || null,
    input_state_name: payload.stateName || null,
  }, token));

export const setAccountingIntegration = (token, enabled) =>
  wrap(supabase.rpc("acc_set_integration", { input_enabled: Boolean(enabled) }, token));

export const createChartAccount = async (token, payload) => {
  const id = await wrap(accRpc("acc_create_coa", {
    input_code: payload.code,
    input_name: payload.name,
    input_group_type: payload.groupType,
    input_account_type: payload.accountType || "other",
    input_opening: Number(payload.openingBalance || 0),
    input_opening_side: payload.openingSide || "debit",
  }, token));
  if (payload.parentId) await setChartAccountParent(token, id, payload.parentId);
  return id;
};

export const updateChartAccount = async (token, payload) => {
  await wrap(accRpc("acc_update_coa", {
    input_id: payload.id,
    input_code: payload.code,
    input_name: payload.name,
    input_opening: Number(payload.openingBalance || 0),
    input_opening_side: payload.openingSide || "debit",
    input_is_active: payload.isActive !== false,
  }, token));
  await setChartAccountParent(token, payload.id, payload.parentId || null);
};

export const setChartAccountParent = (token, id, parentId) =>
  ignoreMissing(accRpc("acc_set_coa_parent", {
    input_id: id,
    input_parent_id: parentId || null,
  }, token));

export const deleteChartAccount = (token, id) =>
  wrap(accRpc("acc_delete_coa", { input_id: id }, token));

const wrapPartyMutation = promise => promise.catch(err => {
  if (isMissing(err)) {
    throw new Error("Run 058–060 in the Supabase SQL editor to enable party edit and GST.");
  }
  throw err;
});

export const createParty = (token, payload) =>
  wrap(accRpc("acc_create_party", {
    input_party_type: payload.partyType,
    input_name: payload.name,
    input_phone: payload.phone || null,
    input_email: payload.email || null,
    input_address: payload.address || null,
    input_gstin: payload.gstin || null,
    input_notes: payload.notes || null,
    input_state_code: payload.stateCode || null,
    input_gst_registration: payload.gstRegistration || null,
  }, token));

export const updateParty = (token, payload) =>
  wrapPartyMutation(accRpc("acc_update_party", {
    input_id: payload.id,
    input_party_type: payload.partyType,
    input_name: payload.name,
    input_phone: payload.phone || null,
    input_email: payload.email || null,
    input_address: payload.address || null,
    input_gstin: payload.gstin || null,
    input_notes: payload.notes || null,
    input_state_code: payload.stateCode || null,
    input_gst_registration: payload.gstRegistration || null,
  }, token));

export const deleteParty = (token, id) =>
  wrapPartyMutation(accRpc("acc_delete_party", { input_id: id }, token));

export const setPartyActive = (token, id, isActive) =>
  wrapPartyMutation(accRpc("acc_set_party_active", {
    input_id: id,
    input_active: isActive !== false,
  }, token));

export const postVoucher = async (token, payload) => {
  const itemLines = (payload.itemLines || []).map(line => ({
    item_id: line.itemId || null,
    item_name: line.itemName || line.name || "",
    item_sku: line.itemSku || line.sku || "",
    item_type: line.itemType || "product",
    unit: line.unit || "Nos",
    quantity: Number(line.quantity || 0),
    rate: Number(line.rate || 0),
    amount: Number(line.amount || 0),
    gst_rate: Number(line.gstRate || 0),
    hsn_sac: line.hsnSac || "",
    taxable_amount: Number(line.taxableAmount ?? line.amount ?? 0),
    cgst_amount: Number(line.cgstAmount || 0),
    sgst_amount: Number(line.sgstAmount || 0),
    igst_amount: Number(line.igstAmount || 0),
  }));
  const id = await wrap(accRpc("acc_post_voucher", {
    input_voucher_type: payload.voucherType,
    input_date: payload.date,
    input_narration: payload.narration || "",
    input_lines: payload.lines.map(line => ({
      coa_id: line.coaId,
      party_id: line.partyId || null,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description || payload.narration || "",
    })),
    input_party_id: payload.partyId || null,
    input_source_module: payload.sourceModule || null,
    input_source_type: payload.sourceType || null,
    input_source_transaction_id: payload.sourceTransactionId || null,
    input_gst_lines: payload.gstLines?.length ? payload.gstLines : null,
    input_client_request_id: payload.clientRequestId || null,
    input_item_lines: itemLines.length ? itemLines : null,
  }, token));
  if (payload.dueDate) await setVoucherDueDate(token, id, payload.dueDate);
  // Legacy path: older DBs without input_item_lines still accept a follow-up save.
  if (itemLines.length && payload.forceSeparateItemSave) {
    try {
      await saveVoucherItemLines(token, id, payload.itemLines);
    } catch (err) {
      try { await cancelVoucher(token, id, "Item lines failed; voucher cancelled"); } catch { /* best effort */ }
      throw err;
    }
  }
  return id;
};

export const setVoucherDueDate = (token, id, dueDate) =>
  ignoreMissing(accRpc("acc_set_voucher_due", {
    input_voucher_id: id,
    input_due: dueDate || null,
  }, token));

export const cancelVoucher = async (token, id, reason) => {
  await wrap(accRpc("acc_cancel_voucher", { input_voucher_id: id, input_reason: reason }, token));
  // Stock reversal is performed inside acc_cancel_voucher (072+); keep best-effort for older DBs.
  await ignoreMissing(accRpc("acc_reverse_voucher_stock", { input_voucher_id: id }, token));
};

export const reverseVoucher = async (token, id, date, reason) => {
  await wrap(accRpc("acc_reverse_voucher", {
    input_voucher_id: id,
    input_date: date,
    input_reason: reason,
  }, token));
  await ignoreMissing(accRpc("acc_reverse_voucher_stock", { input_voucher_id: id }, token));
};
export const lockAccountingPeriod = (token, from, to) =>
  wrap(accRpc("acc_lock_period", { input_from: from, input_to: to }, token));

export const reopenAccountingPeriod = (token, id, reason) =>
  wrap(accRpc("acc_reopen_period", { input_lock_id: id, input_reason: reason }, token));

export const syncAccountingOperations = token =>
  wrap(supabase.rpc("acc_sync_operations", {}, token));

export const addBankStatement = (token, payload) =>
  wrap(accRpc("acc_add_bank_statement", {
    input_coa_id: payload.coaId,
    input_statement_date: payload.statementDate,
    input_opening: Number(payload.openingBalance || 0),
    input_closing: Number(payload.closingBalance || 0),
    input_lines: (payload.lines || []).map(line => ({
      line_date: line.line_date || line.lineDate,
      description: line.description || "",
      amount: Number(line.amount || 0),
      direction: line.direction || "in",
      reference: line.reference || "",
    })),
  }, token));

export const ignoreBankLine = (token, lineId, note) =>
  wrap(accRpc("acc_ignore_bank_line", {
    input_line_id: lineId,
    input_note: note || null,
  }, token));

export const trackProductEventRpc = (token, eventName, properties = {}) =>
  ignoreMissing(supabase.rpc("track_product_event", {
    input_event_name: eventName,
    input_properties: properties || {},
  }, token));

export const loadAccountsRoles = token =>
  ignoreMissing(
    accQuery("/rest/v1/acc_user_roles?select=id,user_id,role,created_at&order=created_at.asc", token)
      .then(rows => (rows || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        createdAt: row.created_at,
      }))),
  ).then(rows => rows || []);

export const setAccountsUserRole = (token, userId, role) =>
  wrap(supabase.rpc("acc_set_user_role", {
    input_user_id: userId,
    input_role: role || null,
  }, token));

export const loadAccountsAccessRole = token =>
  ignoreMissing(supabase.rpc("accounts_access_role", {}, token))
    .then(role => (role == null || role === "" ? null : String(role)))
    .catch(() => null);

export const loadVoucherAttachments = (token, voucherId) => wrap(
  accQuery(
    `/rest/v1/acc_voucher_attachments?select=id,voucher_id,file_name,content_type,byte_size,content_base64,created_at&voucher_id=eq.${encodeURIComponent(voucherId)}&order=created_at.desc${companyEq()}`,
    token,
  ).then(rows => (rows || []).map(row => ({
    id: row.id,
    voucherId: row.voucher_id,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size || 0),
    contentBase64: row.content_base64,
    createdAt: row.created_at,
  }))),
);

export const addVoucherAttachment = (token, { voucherId, fileName, contentType, contentBase64 }) =>
  wrap(accRpc("acc_add_voucher_attachment", {
    input_voucher_id: voucherId,
    input_file_name: fileName,
    input_content_type: contentType,
    input_content_base64: contentBase64,
  }, token));

export const deleteVoucherAttachment = (token, attachmentId) =>
  wrap(accRpc("acc_delete_voucher_attachment", { input_attachment_id: attachmentId }, token));

export const matchBankLine = (token, lineId, voucherLineId, note) =>
  wrap(accRpc("acc_match_bank_line", {
    input_line_id: lineId,
    input_voucher_line_id: voucherLineId || null,
    input_note: note || null,
  }, token));

const mapItemCategory = row => ({
  id: row.id,
  name: row.name,
  isActive: row.is_active !== false,
});

const mapItem = row => ({
  id: row.id,
  itemType: row.item_type || "product",
  name: row.name,
  sku: row.sku,
  categoryId: row.category_id || null,
  unit: row.unit || "Nos",
  description: row.description || "",
  sellingPrice: Number(row.selling_price || 0),
  purchasePrice: Number(row.purchase_price || 0),
  gstRate: Number(row.gst_rate || 0),
  hsnSac: row.hsn_sac || "",
  openingStock: Number(row.opening_stock || 0),
  openingStockDate: row.opening_stock_date || null,
  reorderLevel: Number(row.reorder_level || 0),
  isActive: row.is_active !== false,
});

const mapVoucherItemLine = row => ({
  id: row.id,
  voucherId: row.voucher_id,
  lineNo: row.line_no,
  itemId: row.item_id || null,
  itemName: row.item_name,
  itemSku: row.item_sku || "",
  itemType: row.item_type || "product",
  unit: row.unit || "Nos",
  quantity: Number(row.quantity || 0),
  rate: Number(row.rate || 0),
  amount: Number(row.amount || 0),
  gstRate: Number(row.gst_rate || 0),
  hsnSac: row.hsn_sac || "",
  taxableAmount: Number(row.taxable_amount || 0),
  cgstAmount: Number(row.cgst_amount || 0),
  sgstAmount: Number(row.sgst_amount || 0),
  igstAmount: Number(row.igst_amount || 0),
});

const mapStockMovement = row => ({
  id: row.id,
  itemId: row.item_id,
  movementDate: row.movement_date,
  quantityDelta: Number(row.quantity_delta || 0),
  reason: row.reason,
  note: row.note || "",
  voucherId: row.voucher_id || null,
  voucherItemLineId: row.voucher_item_line_id || null,
  voucherNumber: row.voucher_number || "",
  createdAt: row.created_at,
});

export const loadItemCategories = token => wrap(
  accQuery(`/rest/v1/acc_item_categories?select=id,name,is_active&order=name.asc${companyEq()}`, token)
    .then(rows => (rows || []).map(mapItemCategory)),
);

export const loadItems = token => wrap(
  accQuery(
    `/rest/v1/acc_items?select=id,item_type,name,sku,category_id,unit,description,selling_price,purchase_price,gst_rate,hsn_sac,opening_stock,opening_stock_date,reorder_level,is_active&order=name.asc${companyEq()}`,
    token,
  ).then(rows => (rows || []).map(mapItem)),
);

export const loadVoucherItemLines = token => wrap(
  accQuery(
    `/rest/v1/acc_voucher_item_lines?select=id,voucher_id,line_no,item_id,item_name,item_sku,item_type,unit,quantity,rate,amount,gst_rate,hsn_sac,taxable_amount,cgst_amount,sgst_amount,igst_amount&order=line_no.asc&limit=20000${companyEq()}`,
    token,
  ).then(rows => (rows || []).map(mapVoucherItemLine)),
);

export const loadStockMovements = token => wrap(
  accQuery(
    `/rest/v1/acc_stock_movements?select=id,item_id,movement_date,quantity_delta,reason,note,voucher_id,voucher_item_line_id,voucher_number,created_at&order=movement_date.desc,created_at.desc&limit=20000${companyEq()}`,
    token,
  ).then(rows => (rows || []).map(mapStockMovement)),
);

export const upsertItemCategory = (token, { id = null, name }) =>
  wrap(accRpc("acc_upsert_item_category", { input_id: id, input_name: name }, token));

export const deleteItemCategory = (token, id) =>
  wrap(accRpc("acc_delete_item_category", { input_id: id }, token));

export const upsertItem = (token, form) =>
  wrap(accRpc("acc_upsert_item", {
    input_id: form.id || null,
    input_item_type: form.itemType || "product",
    input_name: form.name,
    input_sku: form.sku,
    input_category_id: form.categoryId || null,
    input_unit: form.unit || "Nos",
    input_description: form.description || null,
    input_selling_price: Number(form.sellingPrice || 0),
    input_purchase_price: Number(form.purchasePrice || 0),
    input_gst_rate: Number(form.gstRate || 0),
    input_hsn_sac: form.hsnSac || null,
    input_opening_stock: Number(form.openingStock || 0),
    input_opening_stock_date: form.openingStockDate || null,
    input_reorder_level: Number(form.reorderLevel || 0),
    input_is_active: form.isActive !== false,
  }, token));

export const setItemActive = (token, id, isActive) =>
  wrap(accRpc("acc_set_item_active", { input_id: id, input_active: isActive !== false }, token));

export const deleteItem = (token, id) =>
  wrap(accRpc("acc_delete_item", { input_id: id }, token));

export const adjustStock = (token, { itemId, date, quantityDelta, reasonNote }) =>
  wrap(accRpc("acc_adjust_stock", {
    input_item_id: itemId,
    input_date: date,
    input_quantity_delta: Number(quantityDelta),
    input_reason_note: reasonNote,
  }, token));

export const saveVoucherItemLines = (token, voucherId, lines) =>
  wrap(accRpc("acc_save_voucher_item_lines", {
    input_voucher_id: voucherId,
    input_lines: lines,
  }, token));
