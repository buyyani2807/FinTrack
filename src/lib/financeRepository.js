import { supabase } from "./supabase";

const asNumber = value => Number(value || 0);

export async function loadWorkspace(token) {
  const rows = await supabase.query("/rest/v1/profiles?select=id,full_name,role,organizations(name)&limit=1", token);
  const profile = rows[0];
  const organization = Array.isArray(profile?.organizations) ? profile.organizations[0] : profile?.organizations;
  return { businessName: organization?.name || "My Finance Business", fullName: profile?.full_name || "", role: profile?.role || "owner", id: profile?.id || "" };
}

export async function loadFinanceAccounts(token) {
  const rows = await supabase.query(
    "/rest/v1/finance_accounts?select=*,customers(*),payments(*,profiles!payments_collected_by_fkey(full_name)),rate_changes(*),customer_portal_credentials(portal_id)&order=collection_order.asc,created_at.asc",
    token,
  );
  return rows.map(account => {
    const credential = Array.isArray(account.customer_portal_credentials) ? account.customer_portal_credentials[0] : account.customer_portal_credentials;
    return ({
    id: account.id,
    customerId: account.customer_id,
    customerName: account.customers.full_name,
    phone: account.customers.phone,
    address: account.customers.address || "",
    kind: account.kind,
    startDate: account.start_date,
    collectionAmount: asNumber(account.collection_amount),
    disbursedAmount: asNumber(account.disbursed_amount),
    dailyCollection: asNumber(account.daily_collection),
    principal: asNumber(account.principal),
    annualRate: asNumber(account.monthly_interest_rate),
    penaltyRate: asNumber(account.penalty_rate),
    status: account.status || "active",
    lossAmount: asNumber(account.loss_amount),
    statusNote: account.status_note || "",
    statusChangedAt: account.status_changed_at || "",
    collectionOrder: Number(account.collection_order || 999999),
    collectionAgentId: account.collection_agent_id || "",
    portalId: credential?.portal_id || "",
    rateChanges: (account.rate_changes || []).map(rate => ({ effectiveDate: rate.effective_date, annualRate: asNumber(rate.monthly_interest_rate) })),
    transactions: (account.payments || []).map(payment => ({
      id: payment.id, date: payment.paid_on, mode: payment.mode, amount: asNumber(payment.total_amount),
      interestAmount: asNumber(payment.interest_amount), principalAmount: asNumber(payment.principal_amount),
      penaltyAmount: asNumber(payment.penalty_amount), ref: payment.payment_reference || "", notes: payment.notes || "",
      collectedBy: payment.collected_by || "", collectorName: (Array.isArray(payment.profiles) ? payment.profiles[0] : payment.profiles)?.full_name || "Financier/Admin",
    })),
    });
  });
}

export async function createFinanceAccount(token, loan) {
  return supabase.rpc("create_finance_account", {
    customer_full_name: loan.customerName, customer_phone: loan.phone, customer_address: loan.address,
    account_kind: loan.kind, account_start_date: loan.startDate,
    account_collection_amount: loan.kind === "daily" ? loan.collectionAmount : null,
    account_disbursed_amount: loan.kind === "daily" ? loan.disbursedAmount : null,
    account_daily_collection: loan.kind === "daily" ? loan.dailyCollection : null,
    account_principal: loan.kind === "monthly" ? loan.principal : null,
    account_monthly_interest_rate: loan.kind === "monthly" ? loan.annualRate : null,
    account_penalty_rate: loan.kind === "monthly" ? loan.penaltyRate : 0,
  }, token);
}

export async function recordPayment(token, loan, payment) {
  return supabase.rpc("record_finance_payment", {
    account_id: loan.id, payment_date: payment.date, payment_mode: payment.mode,
    amount_total: payment.amount,
    amount_interest: payment.interestAmount || 0, amount_principal: payment.principalAmount || 0,
    amount_penalty: payment.penaltyAmount || 0, payment_ref: payment.ref || "", payment_notes: payment.notes || "",
  }, token);
}

export async function updateFinanceAccount(token, loan) {
  return supabase.rpc("update_finance_account", {
    account_id: loan.id, customer_full_name: loan.customerName, customer_phone: loan.phone, customer_address: loan.address,
    account_kind: loan.kind,
    account_collection_amount: loan.kind === "daily" ? loan.collectionAmount : null,
    account_disbursed_amount: loan.kind === "daily" ? loan.disbursedAmount : null,
    account_daily_collection: loan.kind === "daily" ? loan.dailyCollection : null,
    account_principal: loan.kind === "monthly" ? loan.principal : null,
    account_monthly_interest_rate: loan.kind === "monthly" ? loan.annualRate : null,
    account_penalty_rate: loan.kind === "monthly" ? loan.penaltyRate : 0,
  }, token);
}

export async function deleteFinanceAccount(token, accountId) {
  return supabase.rpc("delete_finance_account", { account_id: accountId }, token);
}
export const resetCustomerPortalPin = (token, accountId, pin) => supabase.rpc("reset_customer_portal_pin", { account_id: accountId, new_pin: pin }, token);
export const enableCustomerPortal = (token, accountId, pin) => supabase.rpc("enable_customer_portal", { account_id: accountId, new_pin: pin }, token);
export const customerPortalLogin = (portalId, pin) => supabase.rpc("customer_portal_login", { input_portal_id: portalId, input_pin: pin });
export const loadCustomerKyc = (token, accountId) => supabase.rpc("get_customer_kyc", { account_id: accountId }, token);
export const saveCustomerKyc = (token, accountId, aadhaar, pan) => supabase.rpc("save_customer_kyc", { account_id: accountId, aadhaar, pan }, token);
export const updatePaymentNotes = (token, paymentId, notes) => supabase.rpc("update_payment_notes", { payment_id: paymentId, payment_notes: notes }, token);
export const setAccountStatus = (token, accountId, status, note) => supabase.rpc("set_finance_account_status", { account_id: accountId, new_status: status, action_note: note || "" }, token);
export const saveCollectionOrder = (token, accountIds) => supabase.rpc("set_collection_order", { account_ids: accountIds }, token);
export const loadCollectionAgents = token => supabase.query("/rest/v1/profiles?select=id,full_name,role&role=eq.staff&order=full_name.asc", token);
export const assignCollectionAgent = (token, accountId, agentId) => supabase.rpc("assign_collection_agent", { account_id: accountId, agent_id: agentId || null }, token);
