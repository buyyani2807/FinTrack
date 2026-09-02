import { supabase } from "../../lib/supabase";

const isMissing = err => /could not find|does not exist|schema cache|404/i.test(String(err?.message || ""));

const wrap = promise => promise.catch(err => {
  if (isMissing(err)) {
    const error = new Error("Run migration 052 in the Supabase SQL editor to enable FinTrack Accounts.");
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
  notes: row.notes || "",
  isActive: row.is_active,
});

const mapVoucher = (row, lines = []) => ({
  id: row.id,
  voucherType: row.voucher_type,
  voucherNumber: row.voucher_number,
  date: row.voucher_date,
  narration: row.narration || "",
  status: row.status,
  partyId: row.party_id,
  sourceModule: row.source_module,
  sourceType: row.source_type,
  sourceTransactionId: row.source_transaction_id,
  cancelReason: row.cancel_reason || "",
  dueDate: row.due_date || null,
  createdAt: row.created_at,
  postedAt: row.posted_at,
  lines: lines
    .filter(line => line.voucher_id === row.id)
    .sort((a, b) => a.line_no - b.line_no)
    .map(line => ({
      id: line.id,
      lineNo: line.line_no,
      coaId: line.coa_id,
      partyId: line.party_id,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description || "",
      code: line.acc_coa?.code,
      name: line.acc_coa?.name,
    })),
});

export const loadAccountingSettings = token => wrap(
  supabase.query("/rest/v1/acc_settings?select=*&limit=1", token)
    .then(rows => rows[0] ? {
      companyName: rows[0].company_name || "",
      fyStartMonth: Number(rows[0].fy_start_month || 4),
      booksStartedOn: rows[0].books_started_on || "",
      integrationEnabled: Boolean(rows[0].integration_enabled),
    } : null),
);

export const loadChartOfAccounts = token => wrap(
  supabase.query("/rest/v1/acc_coa?select=*&order=code.asc", token).then(rows => rows.map(mapCoa)),
);

export const loadParties = token => wrap(
  supabase.query("/rest/v1/acc_parties?select=*&order=name.asc", token).then(rows => rows.map(mapParty)),
);

export const loadVouchers = token => wrap(
  Promise.all([
    supabase.query("/rest/v1/acc_vouchers?select=*&order=voucher_date.desc,voucher_number.desc&limit=2000", token),
    supabase.query("/rest/v1/acc_voucher_lines?select=*,acc_coa(code,name)&order=line_no.asc&limit=20000", token),
  ]).then(([vouchers, lines]) => vouchers.map(row => mapVoucher(row, lines))),
);

export const loadAuditLog = token => wrap(
  supabase.query("/rest/v1/acc_audit_log?select=*&order=created_at.desc&limit=300", token)
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
  supabase.query("/rest/v1/acc_period_locks?select=*&order=period_from.desc", token)
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
    supabase.query("/rest/v1/acc_bank_statements?select=*,acc_coa(name,code)&order=statement_date.desc", token),
    supabase.query("/rest/v1/acc_bank_statement_lines?select=*&order=line_date.asc", token),
  ]).then(([statements, lines]) => statements.map(row => ({
    id: row.id,
    coaId: row.coa_id,
    accountName: row.acc_coa?.name || "",
    statementDate: row.statement_date,
    openingBalance: Number(row.opening_balance || 0),
    closingBalance: Number(row.closing_balance || 0),
    lines: lines.filter(line => line.statement_id === row.id).map(line => ({
      id: line.id,
      lineDate: line.line_date,
      description: line.description,
      amount: Number(line.amount || 0),
      direction: line.direction,
      matchedVoucherLineId: line.matched_voucher_line_id,
      matchStatus: line.match_status,
    })),
  }))),
);

export const initializeAccounting = (token, { companyName, booksStartedOn } = {}) =>
  wrap(supabase.rpc("acc_initialize", {
    input_company_name: companyName || null,
    input_books_started_on: booksStartedOn || null,
  }, token));

export const saveAccountingSettings = (token, payload) =>
  wrap(supabase.rpc("acc_save_settings", {
    input_company_name: payload.companyName || null,
    input_fy_start_month: payload.fyStartMonth || 4,
    input_books_started_on: payload.booksStartedOn || null,
  }, token));

export const setAccountingIntegration = (token, enabled) =>
  wrap(supabase.rpc("acc_set_integration", { input_enabled: Boolean(enabled) }, token));

export const createChartAccount = async (token, payload) => {
  const id = await wrap(supabase.rpc("acc_create_coa", {
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
  await wrap(supabase.rpc("acc_update_coa", {
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
  ignoreMissing(supabase.rpc("acc_set_coa_parent", {
    input_id: id,
    input_parent_id: parentId || null,
  }, token));

export const deleteChartAccount = (token, id) =>
  wrap(supabase.rpc("acc_delete_coa", { input_id: id }, token));

const wrapPartyMutation = promise => promise.catch(err => {
  if (isMissing(err)) {
    throw new Error("Run 058_accounts_party_update_delete.sql in the Supabase SQL editor to enable party edit and delete.");
  }
  throw err;
});

export const createParty = (token, payload) =>
  wrap(supabase.rpc("acc_create_party", {
    input_party_type: payload.partyType,
    input_name: payload.name,
    input_phone: payload.phone || null,
    input_email: payload.email || null,
    input_address: payload.address || null,
    input_gstin: payload.gstin || null,
    input_notes: payload.notes || null,
  }, token));

export const updateParty = (token, payload) =>
  wrapPartyMutation(supabase.rpc("acc_update_party", {
    input_id: payload.id,
    input_party_type: payload.partyType,
    input_name: payload.name,
    input_phone: payload.phone || null,
    input_email: payload.email || null,
    input_address: payload.address || null,
    input_gstin: payload.gstin || null,
    input_notes: payload.notes || null,
  }, token));

export const deleteParty = (token, id) =>
  wrapPartyMutation(supabase.rpc("acc_delete_party", { input_id: id }, token));

export const setPartyActive = (token, id, isActive) =>
  wrapPartyMutation(supabase.rpc("acc_set_party_active", {
    input_id: id,
    input_active: isActive !== false,
  }, token));

export const postVoucher = async (token, payload) => {
  const id = await wrap(supabase.rpc("acc_post_voucher", {
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
  }, token));
  if (payload.dueDate) await setVoucherDueDate(token, id, payload.dueDate);
  return id;
};

export const setVoucherDueDate = (token, id, dueDate) =>
  ignoreMissing(supabase.rpc("acc_set_voucher_due", {
    input_voucher_id: id,
    input_due: dueDate || null,
  }, token));

export const cancelVoucher = (token, id, reason) =>
  wrap(supabase.rpc("acc_cancel_voucher", { input_voucher_id: id, input_reason: reason }, token));

export const reverseVoucher = (token, id, date, reason) =>
  wrap(supabase.rpc("acc_reverse_voucher", {
    input_voucher_id: id,
    input_date: date,
    input_reason: reason,
  }, token));

export const lockAccountingPeriod = (token, from, to) =>
  wrap(supabase.rpc("acc_lock_period", { input_from: from, input_to: to }, token));

export const reopenAccountingPeriod = (token, id, reason) =>
  wrap(supabase.rpc("acc_reopen_period", { input_lock_id: id, input_reason: reason }, token));

export const syncAccountingOperations = token =>
  wrap(supabase.rpc("acc_sync_operations", {}, token));

export const addBankStatement = (token, payload) =>
  wrap(supabase.rpc("acc_add_bank_statement", {
    input_coa_id: payload.coaId,
    input_statement_date: payload.statementDate,
    input_opening: Number(payload.openingBalance || 0),
    input_closing: Number(payload.closingBalance || 0),
    input_lines: payload.lines || [],
  }, token));

export const matchBankLine = (token, lineId, voucherLineId, note) =>
  wrap(supabase.rpc("acc_match_bank_line", {
    input_line_id: lineId,
    input_voucher_line_id: voucherLineId || null,
    input_note: note || null,
  }, token));
