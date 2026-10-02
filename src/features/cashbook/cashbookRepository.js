import { supabase } from "../../lib/supabase";

const mapLedger = row => ({
  id: row.id,
  accountType: row.account_type,
  name: row.name,
  bankAccountLast4: row.bank_account_last4 || "",
  isDefault: row.is_default,
  isActive: row.is_active,
});

const mapEntry = row => ({
  id: row.id,
  ledgerAccountId: row.ledger_account_id,
  ledgerName: row.ledger_accounts?.name || "",
  ledgerType: row.ledger_accounts?.account_type || "",
  entryDate: row.entry_date,
  entryTime: row.entry_time,
  transactionType: row.transaction_type,
  category: row.category,
  description: row.description,
  moneyIn: Number(row.money_in || 0),
  moneyOut: Number(row.money_out || 0),
  reference: row.reference || "",
  notes: row.notes || "",
  sourceType: row.source_type,
  sourceId: row.source_id,
  sourceLineKey: row.source_line_key,
  customerId: row.customer_id,
  financeAccountId: row.finance_account_id,
  receiptNumber: row.receipt_number || "",
  paymentMode: row.payment_mode || "",
  isEditable: row.is_editable,
  createdAt: row.created_at,
});

export const loadLedgerAccounts = token =>
  supabase.query("/rest/v1/ledger_accounts?select=*&order=account_type.asc,name.asc", token)
    .then(rows => rows.map(mapLedger));

export const loadCashbookEntries = token =>
  supabase.query(
    "/rest/v1/cashbook_entries?select=*,ledger_accounts(name,account_type)&order=entry_date.desc,entry_time.desc,created_at.desc&limit=5000",
    token,
  ).then(rows => rows.map(mapEntry));

export const loadDayClosings = token =>
  supabase.query(
    "/rest/v1/day_closings?select=*,ledger_accounts(name,account_type)&order=closing_date.desc&limit=200",
    token,
  );

export const initializeAccounts = (token, { openingCash = 0, openingUpi = 0, openingBank = 0 } = {}) =>
  supabase.rpc("accounts_initialize", {
    opening_cash: openingCash,
    opening_upi: openingUpi,
    opening_bank: openingBank,
  }, token);

export const backfillCashbook = token =>
  supabase.rpc("accounts_backfill_cashbook", {}, token);

export const recordManualEntry = (token, payload) =>
  supabase.rpc("accounts_record_manual_entry", {
    input_ledger_account_id: payload.ledgerAccountId,
    input_date: payload.date,
    input_direction: payload.direction,
    input_category: payload.category,
    input_description: payload.description,
    input_amount: payload.amount,
    input_reference: payload.reference || null,
    input_notes: payload.notes || null,
  }, token);

export const recordExpense = (token, payload) =>
  supabase.rpc("accounts_record_expense", {
    input_ledger_account_id: payload.ledgerAccountId,
    input_date: payload.date,
    input_category: payload.category,
    input_amount: payload.amount,
    input_description: payload.description,
    input_notes: payload.notes || null,
    input_reference: payload.reference || null,
  }, token);

export const recordTransfer = (token, payload) =>
  supabase.rpc("accounts_record_transfer", {
    input_from_ledger_id: payload.fromLedgerId,
    input_to_ledger_id: payload.toLedgerId,
    input_date: payload.date,
    input_amount: payload.amount,
    input_description: payload.description || null,
    input_notes: payload.notes || null,
  }, token);

export const recordDayClosing = (token, payload) =>
  supabase.rpc("accounts_record_day_closing", {
    input_ledger_account_id: payload.ledgerAccountId,
    input_date: payload.date,
    input_actual_balance: payload.actualBalance,
    input_notes: payload.notes || null,
  }, token);

export const createBankAccount = (token, { name, bankAccountLast4 }) =>
  supabase.rpc("accounts_create_bank_account", {
    input_name: name.trim(),
    input_last4: bankAccountLast4 || null,
  }, token);

export const deleteManualEntry = (token, entryId) =>
  supabase.rpc("accounts_delete_manual_entry", { input_entry_id: entryId }, token);
