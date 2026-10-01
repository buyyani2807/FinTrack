import { supabase } from "../../../lib/supabase";
import { groupByKey } from "../model/accountsList.js";
import { assembleVouchers } from "../model/accountsVoucherAssembly.js";
import { mapVoucherItemLinesForRpc } from "../model/inventoryModel.js";

export { assembleVouchers, mapVoucherItemLinesForRpc };

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
    const error = new Error("Run migrations 052–076 in the Supabase SQL editor to enable FinTrack Accounts companies, GST, attachments, items, QA hardening, bill-wise settlements, team invites, and recurring templates.");
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
  creditLimit: Number(row.credit_limit || 0),
  creditDays: row.credit_days === null || row.credit_days === undefined ? null : Number(row.credit_days),
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

const PARTY_COLUMNS = "id,party_type,name,phone,email,address,gstin,state_code,gst_registration,notes,is_active";
const partiesPath = columns => `/rest/v1/acc_parties?select=${columns}&order=name.asc${companyEq()}`;

export const loadParties = token => wrap(
  accQuery(partiesPath(`${PARTY_COLUMNS},credit_limit,credit_days`), token)
    .catch(err => {
      if (!/credit_limit|credit_days/i.test(String(err?.message || ""))) throw err;
      return accQuery(partiesPath(PARTY_COLUMNS), token);
    })
    .then(rows => rows.map(mapParty)),
);

const migration081Error = err => {
  if (!isMissing(err)) return err;
  const error = new Error("Run migration 081_accounts_trade_documents.sql in the Supabase SQL editor to enable quotations, orders, challans, document settings and credit limits.");
  error.code = "MIGRATION_REQUIRED";
  return error;
};

export const setPartyCredit = (token, partyId, { creditLimit, creditDays }) =>
  accRpc("acc_set_party_credit", {
    input_party_id: partyId,
    input_credit_limit: Number(creditLimit || 0),
    input_credit_days: creditDays === "" || creditDays === null || creditDays === undefined ? null : Number(creditDays),
  }, token).catch(err => { throw migration081Error(err); });

export const loadPartyPipeline = token => wrap(
  supabase.rpc("acc_list_party_pipeline", { input_company_id: activeCompanyId }, token).then(rows => (Array.isArray(rows) ? rows : []).map(row => ({ partyId: row.party_id, stage: row.stage }))),
);

export const setPartyPipelineStage = (token, partyId, stage) => wrap(
  supabase.rpc("acc_set_party_pipeline", { input_company_id: activeCompanyId, input_party_id: partyId, input_stage: stage }, token),
);

export const loadVouchers = token => wrap(
  Promise.all([
    accQuery(`/rest/v1/acc_vouchers?select=id,voucher_type,voucher_number,voucher_date,narration,status,party_id,source_module,source_type,source_transaction_id,cancel_reason,due_date,settlements,created_at,posted_at&order=voucher_date.desc,voucher_number.desc&limit=2000${companyEq()}`, token)
      .catch(err => {
        if (!isMissing(err) && !/settlements/i.test(String(err?.message || ""))) throw err;
        return accQuery(`/rest/v1/acc_vouchers?select=id,voucher_type,voucher_number,voucher_date,narration,status,party_id,source_module,source_type,source_transaction_id,cancel_reason,due_date,created_at,posted_at&order=voucher_date.desc,voucher_number.desc&limit=2000${companyEq()}`, token);
      }),
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
  const itemLines = mapVoucherItemLinesForRpc(payload.itemLines);
  const args = {
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
  };
  if ((payload.settlements || []).length) {
    args.input_settlements = payload.settlements.map(link => ({
      invoice_voucher_id: link.invoiceVoucherId || link.invoice_voucher_id,
      amount: Number(link.amount || 0),
    }));
  }
  const id = await wrap(accRpc("acc_post_voucher", args, token)).catch(err => {
    if (/only supported on sales and purchase/i.test(String(err?.message || ""))) {
      throw new Error("Returned items need migration 079 (079_accounts_inventory_returns_discounts.sql) in the Supabase SQL editor. Use \"Amount only\" until it is applied.");
    }
    throw err;
  });
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

export const queueEinvoicePayload = (token, voucherId, payload) =>
  wrap(accRpc("acc_queue_einvoice_payload", {
    input_voucher_id: voucherId,
    input_payload: payload,
  }, token));

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
  openingRate: row.opening_rate === null || row.opening_rate === undefined ? null : Number(row.opening_rate),
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
  discountAmount: Number(row.discount_amount || 0),
  gstRate: Number(row.gst_rate || 0),
  hsnSac: row.hsn_sac || "",
  taxableAmount: Number(row.taxable_amount || 0),
  cgstAmount: Number(row.cgst_amount || 0),
  sgstAmount: Number(row.sgst_amount || 0),
  igstAmount: Number(row.igst_amount || 0),
  sourceDocumentLineId: row.source_document_line_id || null,
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
  documentId: row.document_id || null,
  documentLineId: row.document_line_id || null,
  createdAt: row.created_at,
});

export const loadItemCategories = token => wrap(
  accQuery(`/rest/v1/acc_item_categories?select=id,name,is_active&order=name.asc${companyEq()}`, token)
    .then(rows => (rows || []).map(mapItemCategory)),
);

const ITEM_COLUMNS = "id,item_type,name,sku,category_id,unit,description,selling_price,purchase_price,gst_rate,hsn_sac,opening_stock,opening_stock_date,reorder_level,is_active";
const itemsPath = columns => `/rest/v1/acc_items?select=${columns}&order=name.asc${companyEq()}`;

export const loadItems = token => wrap(
  accQuery(itemsPath(`${ITEM_COLUMNS},opening_rate`), token)
    .catch(err => {
      if (!/opening_rate/i.test(String(err?.message || ""))) throw err;
      return accQuery(itemsPath(ITEM_COLUMNS), token);
    })
    .then(rows => (rows || []).map(mapItem)),
);

const migration080Error = err => {
  if (!isMissing(err)) return err;
  const error = new Error("Run migration 080_accounts_inventory_valuation_stock_rules.sql in the Supabase SQL editor to enable opening rate and stock settings.");
  error.code = "MIGRATION_REQUIRED";
  return error;
};

export const setItemOpeningRate = (token, itemId, openingRate) =>
  accRpc("acc_set_item_opening_rate", {
    input_item_id: itemId,
    input_opening_rate: openingRate === "" || openingRate === null || openingRate === undefined ? null : Number(openingRate),
  }, token).catch(err => { throw migration080Error(err); });

export const loadInventorySettings = token =>
  ignoreMissing(accQuery(`/rest/v1/acc_inventory_settings?select=allow_negative_stock${companyEq()}&limit=1`, token))
    .then(rows => ({
      available: rows !== null,
      allowNegativeStock: Boolean(rows?.[0]?.allow_negative_stock),
    }));

export const saveInventorySettings = (token, { allowNegativeStock }) =>
  accRpc("acc_save_inventory_settings", { input_allow_negative_stock: Boolean(allowNegativeStock) }, token)
    .catch(err => { throw migration080Error(err); });

const VOUCHER_ITEM_LINE_COLUMNS = "id,voucher_id,line_no,item_id,item_name,item_sku,item_type,unit,quantity,rate,amount,gst_rate,hsn_sac,taxable_amount,cgst_amount,sgst_amount,igst_amount";
const voucherItemLinesPath = columns => `/rest/v1/acc_voucher_item_lines?select=${columns}&order=line_no.asc&limit=20000${companyEq()}`;

export const loadVoucherItemLines = token => wrap(
  accQuery(voucherItemLinesPath(`${VOUCHER_ITEM_LINE_COLUMNS},discount_amount,source_document_line_id`), token)
    .catch(err => {
      if (!/source_document_line_id/i.test(String(err?.message || ""))) throw err;
      return accQuery(voucherItemLinesPath(`${VOUCHER_ITEM_LINE_COLUMNS},discount_amount`), token);
    })
    .catch(err => {
      if (!/discount_amount/i.test(String(err?.message || ""))) throw err;
      return accQuery(voucherItemLinesPath(VOUCHER_ITEM_LINE_COLUMNS), token);
    })
    .then(rows => (rows || []).map(mapVoucherItemLine)),
);

const STOCK_MOVEMENT_COLUMNS = "id,item_id,movement_date,quantity_delta,reason,note,voucher_id,voucher_item_line_id,voucher_number,created_at";
const stockMovementsPath = columns => `/rest/v1/acc_stock_movements?select=${columns}&order=movement_date.desc,created_at.desc&limit=20000${companyEq()}`;

export const loadStockMovements = token => wrap(
  accQuery(stockMovementsPath(`${STOCK_MOVEMENT_COLUMNS},document_id,document_line_id`), token)
    .catch(err => {
      if (!/document_id|document_line_id/i.test(String(err?.message || ""))) throw err;
      return accQuery(stockMovementsPath(STOCK_MOVEMENT_COLUMNS), token);
    })
    .then(rows => (rows || []).map(mapStockMovement)),
);

const mapTradeDocumentLine = row => ({
  id: row.id,
  documentId: row.document_id,
  lineNo: row.line_no,
  itemId: row.item_id || null,
  itemName: row.item_name,
  itemSku: row.item_sku || "",
  itemType: row.item_type || "product",
  unit: row.unit || "Nos",
  quantity: Number(row.quantity || 0),
  rate: Number(row.rate || 0),
  amount: Number(row.amount || 0),
  discountAmount: Number(row.discount_amount || 0),
  gstRate: Number(row.gst_rate || 0),
  hsnSac: row.hsn_sac || "",
  taxableAmount: Number(row.taxable_amount || 0),
  cgstAmount: Number(row.cgst_amount || 0),
  sgstAmount: Number(row.sgst_amount || 0),
  igstAmount: Number(row.igst_amount || 0),
  sourceLineId: row.source_line_id || null,
});

const mapTradeDocument = (row, lines = []) => ({
  id: row.id,
  docType: row.doc_type,
  docNumber: row.doc_number,
  docDate: row.doc_date,
  validUntil: row.valid_until || "",
  partyId: row.party_id,
  status: row.status,
  reference: row.reference || "",
  notes: row.notes || "",
  terms: row.terms || "",
  sourceDocumentId: row.source_document_id || null,
  stockPosted: Boolean(row.stock_posted),
  taxableTotal: Number(row.taxable_total || 0),
  taxTotal: Number(row.tax_total || 0),
  grandTotal: Number(row.grand_total || 0),
  cancelReason: row.cancel_reason || "",
  createdAt: row.created_at,
  lines,
});

/** Trade documents with their lines, or null when migration 081 has not been run. */
export const loadTradeDocuments = token => ignoreMissing(Promise.all([
  accQuery(`/rest/v1/acc_trade_documents?select=id,doc_type,doc_number,doc_date,valid_until,party_id,status,reference,notes,terms,source_document_id,stock_posted,taxable_total,tax_total,grand_total,cancel_reason,created_at&order=doc_date.desc,doc_number.desc&limit=5000${companyEq()}`, token),
  accQuery(`/rest/v1/acc_trade_document_lines?select=id,document_id,line_no,item_id,item_name,item_sku,item_type,unit,quantity,rate,amount,discount_amount,gst_rate,hsn_sac,taxable_amount,cgst_amount,sgst_amount,igst_amount,source_line_id&order=line_no.asc&limit=50000${companyEq()}`, token),
]).then(([docs, lines]) => {
  const linesBy = groupByKey((lines || []).map(mapTradeDocumentLine), "documentId");
  return (docs || []).map(row => mapTradeDocument(row, linesBy.get(row.id) || []));
}));

export const saveTradeDocument = (token, draft) =>
  accRpc("acc_save_trade_document", {
    input_id: draft.id || null,
    input_doc_type: draft.docType,
    input_doc_date: draft.docDate,
    input_party_id: draft.partyId,
    input_lines: draft.lines,
    input_valid_until: draft.validUntil || null,
    input_reference: draft.reference || null,
    input_notes: draft.notes || null,
    input_terms: draft.terms || null,
    input_source_document_id: draft.sourceDocumentId || null,
  }, token).catch(err => { throw migration081Error(err); });

export const setTradeDocumentStatus = (token, id, status, reason = "") =>
  accRpc("acc_set_trade_document_status", {
    input_id: id,
    input_status: status,
    input_reason: reason || null,
  }, token).catch(err => { throw migration081Error(err); });

const DOCUMENT_SETTING_FIELDS = [
  ["businessAddress", "business_address"],
  ["businessPhone", "business_phone"],
  ["businessEmail", "business_email"],
  ["logoDataUrl", "logo_data_url"],
  ["upiId", "upi_id"],
  ["upiPayeeName", "upi_payee_name"],
  ["bankName", "bank_name"],
  ["bankAccountNumber", "bank_account_number"],
  ["bankIfsc", "bank_ifsc"],
  ["invoiceTemplate", "invoice_template"],
  ["showUpiQr", "show_upi_qr"],
  ["invoiceTerms", "invoice_terms"],
  ["quotationTerms", "quotation_terms"],
  ["creditControl", "credit_control"],
  ["overdueBlockDays", "overdue_block_days"],
];

export const DEFAULT_DOCUMENT_SETTINGS = {
  businessAddress: "",
  businessPhone: "",
  businessEmail: "",
  logoDataUrl: "",
  upiId: "",
  upiPayeeName: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  invoiceTemplate: "a4",
  showUpiQr: true,
  invoiceTerms: "",
  quotationTerms: "",
  creditControl: "warn",
  overdueBlockDays: 0,
};

export const loadDocumentSettings = token =>
  ignoreMissing(accQuery(`/rest/v1/acc_document_settings?select=${DOCUMENT_SETTING_FIELDS.map(([, column]) => column).join(",")}${companyEq()}&limit=1`, token))
    .then(rows => {
      const row = rows?.[0] || {};
      const settings = { ...DEFAULT_DOCUMENT_SETTINGS, available: rows !== null };
      for (const [key, column] of DOCUMENT_SETTING_FIELDS) {
        if (row[column] !== null && row[column] !== undefined) settings[key] = row[column];
      }
      settings.overdueBlockDays = Number(settings.overdueBlockDays || 0);
      settings.showUpiQr = settings.showUpiQr !== false;
      return settings;
    });

export const saveDocumentSettings = (token, settings) => {
  const payload = {};
  for (const [key, column] of DOCUMENT_SETTING_FIELDS) payload[column] = settings[key] ?? DEFAULT_DOCUMENT_SETTINGS[key];
  payload.overdue_block_days = Number(payload.overdue_block_days || 0);
  payload.show_upi_qr = payload.show_upi_qr !== false;
  return accRpc("acc_save_document_settings", { input_settings: payload }, token)
    .catch(err => { throw migration081Error(err); });
};

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
    input_lines: mapVoucherItemLinesForRpc(lines),
  }, token));

export const claimTeamInvites = token =>
  ignoreMissing(supabase.rpc("acc_claim_team_invites", {}, token))
    .then(result => result || { claimed: 0 });

export const inviteTeamMember = (token, { email, role, note } = {}) =>
  wrap(supabase.rpc("acc_invite_team_member", {
    input_email: email,
    input_role: role || "viewer",
    input_note: note || null,
  }, token));

export const listTeamInvites = token =>
  ignoreMissing(supabase.rpc("acc_list_team_invites", {}, token))
    .then(rows => {
      if (Array.isArray(rows)) return rows;
      if (rows == null) return [];
      return [];
    });

export const revokeTeamInvite = (token, inviteId) =>
  wrap(supabase.rpc("acc_revoke_team_invite", { input_invite_id: inviteId }, token));

const mapRecurringTemplate = row => ({
  id: row.id,
  companyId: row.company_id,
  name: row.name,
  kind: row.kind,
  frequency: row.frequency,
  nextRunOn: row.next_run_on,
  amount: Number(row.amount || 0),
  partyId: row.party_id || null,
  narration: row.narration || "",
  mode: row.mode || "cash",
  isActive: row.is_active !== false,
  lastRunOn: row.last_run_on || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const loadRecurringTemplates = token =>
  ignoreMissing(
    accQuery(
      `/rest/v1/acc_recurring_templates?select=id,company_id,name,kind,frequency,next_run_on,amount,party_id,narration,mode,is_active,last_run_on,created_at,updated_at&order=next_run_on.asc${companyEq()}`,
      token,
    ),
  ).then(rows => (rows || []).map(mapRecurringTemplate));

export const upsertRecurringTemplate = (token, form) =>
  wrap(accRpc("acc_upsert_recurring_template", {
    input_id: form.id || null,
    input_name: form.name,
    input_kind: form.kind || "sale",
    input_frequency: form.frequency || "monthly",
    input_next_run_on: form.nextRunOn,
    input_amount: Number(form.amount || 0),
    input_party_id: form.partyId || null,
    input_narration: form.narration || null,
    input_mode: form.mode || "cash",
    input_is_active: form.isActive !== false,
  }, token));

export const deleteRecurringTemplate = (token, id) =>
  wrap(accRpc("acc_delete_recurring_template", { input_id: id }, token));

export const markRecurringRun = (token, id, runOn = null) =>
  wrap(accRpc("acc_mark_recurring_run", {
    input_id: id,
    input_run_on: runOn || null,
  }, token));

const migration082Error = err => {
  if (!isMissing(err)) return err;
  const error = new Error("Run migration 082_accounts_route_collections_gst_filings.sql in the Supabase SQL editor to enable collection routes and GST filing tracking.");
  error.code = "MIGRATION_REQUIRED";
  return error;
};

/** Routes with their stops, or null when migration 082 has not been run. */
export const loadCollectionRoutes = token => ignoreMissing(Promise.all([
  accQuery(`/rest/v1/acc_collection_routes?select=id,name,agent_id,weekdays,notes,is_active,updated_at&order=name.asc${companyEq()}`, token),
  accQuery(`/rest/v1/acc_collection_route_stops?select=route_id,party_id,stop_order&order=stop_order.asc&limit=20000${companyEq()}`, token),
]).then(([routes, stops]) => ({ routes: routes || [], stops: stops || [] })));

export const loadCollectionAgents = token =>
  supabase.rpc("acc_list_collection_agents", {}, token)
    .then(rows => (Array.isArray(rows) ? rows : []))
    .catch(err => { throw migration082Error(err); });

export const saveCollectionRoute = (token, route) =>
  accRpc("acc_save_collection_route", {
    input_id: route.id || null,
    input_name: route.name,
    input_agent_id: route.agentId || null,
    input_weekdays: (route.weekdays || []).map(Number),
    input_notes: route.notes || null,
    input_is_active: route.isActive !== false,
  }, token).catch(err => { throw migration082Error(err); });

export const deleteCollectionRoute = (token, id) =>
  accRpc("acc_delete_collection_route", { input_id: id }, token).catch(err => { throw migration082Error(err); });

export const setRouteStops = (token, routeId, partyIds) =>
  accRpc("acc_set_route_stops", { input_route_id: routeId, input_party_ids: partyIds || [] }, token)
    .catch(err => { throw migration082Error(err); });

export const loadRouteCollectionsReport = (token, from, to) =>
  ignoreMissing(accRpc("acc_route_collections_report", { input_from: from, input_to: to }, token))
    .then(rows => (rows === null ? null : Array.isArray(rows) ? rows : []));

/** GST returns marked filed, or null when migration 082 has not been run. */
export const loadComplianceFilings = token =>
  ignoreMissing(accQuery(`/rest/v1/acc_compliance_filings?select=return_code,period,filed_on,reference&order=period.desc&limit=500${companyEq()}`, token))
    .then(rows => (rows === null ? null : rows.map(row => ({
      returnCode: row.return_code,
      period: row.period,
      filedOn: row.filed_on,
      reference: row.reference || "",
    }))));

export const setComplianceFiling = (token, { returnCode, period, filedOn = null, reference = "", clear = false }) =>
  accRpc("acc_set_compliance_filing", {
    input_return_code: returnCode,
    input_period: period,
    input_filed_on: filedOn || null,
    input_reference: reference || null,
    input_clear: Boolean(clear),
  }, token).catch(err => { throw migration082Error(err); });
