import { supabase } from "./supabase";
import { CHIT_TYPES } from "../features/chitFund/fixedChit.js";
import { flattenSchemePaymentsForReminders } from "../features/receipts/upcomingPayments.js";

const asNumber = value => Number(value || 0);
const memberDisplayName = row => row?.chit_members?.full_name || row?.full_name || "";
const sortMembersByName = rows => [...(rows || [])].sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b), undefined, { sensitivity: "base" }));

const CHIT_SCHEME_LIST_COLUMNS = [
  "id", "name", "chit_type", "chit_value", "duration_months", "member_count", "installment_amount",
  "commission_percent", "fixed_commission_amount", "fixed_initial_lift_amount", "fixed_monthly_increment",
  "predefined_manager_commission_percent", "start_date", "min_bid_percent", "max_bid_percent",
  "late_penalty_amount", "security_deposit_amount", "status",
].join(",");
const CHIT_ACTIVE_SCHEME_COLUMNS = "id,name,chit_type,chit_value,member_count,duration_months,status,start_date";
const CHIT_CYCLE_BOARD_COLUMNS = "id,scheme_id,cycle_number,cycle_date,winning_bid_amount,winning_enrollment_id,status";
const CHIT_ENROLLMENT_BOARD_COLUMNS = "id,scheme_id,ticket_number,status,chit_members(full_name)";
const FIXED_LIFT_BOARD_COLUMNS = "id,scheme_id,month_number,status,enrollment_id,lift_amount";
const PREDEFINED_SCHEDULE_BOARD_COLUMNS = "id,scheme_id,month_number,status,enrollment_id,bid_amount,net_receivable,emi";

let chitDashboardCache = { token: "", at: 0, payload: null };
const CHIT_DASHBOARD_CACHE_MS = 30_000;

export const invalidateChitDashboardCache = () => {
  chitDashboardCache = { token: "", at: 0, payload: null };
};

export const seedChitDashboardCache = (token, payload) => {
  writeChitDashboardCache(token, payload);
};

const readChitDashboardCache = token => {
  if (chitDashboardCache.token !== token || !chitDashboardCache.payload) return null;
  if (Date.now() - chitDashboardCache.at > CHIT_DASHBOARD_CACHE_MS) return null;
  return chitDashboardCache.payload;
};

const writeChitDashboardCache = (token, payload) => {
  chitDashboardCache = { token, at: Date.now(), payload };
};

export const loadChitBoardRelated = token => Promise.all([
  supabase.query(`/rest/v1/chit_cycles?select=${CHIT_CYCLE_BOARD_COLUMNS}&order=cycle_number.asc`, token),
  supabase.query(`/rest/v1/chit_enrollments?select=${CHIT_ENROLLMENT_BOARD_COLUMNS}&order=scheme_id.asc,ticket_number.asc`, token),
  supabase.query(`/rest/v1/fixed_chit_lifts?select=${FIXED_LIFT_BOARD_COLUMNS}&order=month_number.asc`, token).catch(() => []),
  supabase.query(`/rest/v1/predefined_chit_schedule?select=${PREDEFINED_SCHEDULE_BOARD_COLUMNS}&order=month_number.asc`, token).catch(() => []),
]).then(([cycles, enrollments, fixedLifts, predefinedSchedule]) => ({
  cycles,
  enrollments,
  fixedLifts,
  predefinedSchedule,
}));

const mapOrganizationSettings = organization => ({
  companyName: organization?.name || "",
  companyAddress: organization?.company_address || "",
  companyPhone: organization?.company_phone || "",
  companyEmail: organization?.company_email || "",
  companyLogoUrl: organization?.company_logo_url || "",
  receiptFooter: organization?.receipt_footer || "",
  receiptTerms: organization?.receipt_terms || "",
  whatsappTemplates: organization?.whatsapp_templates || {},
  reminderSettings: organization?.reminder_settings || { monthly: { 7: true, 3: true, 1: true, 0: true }, chit: { 7: true, 3: true, 1: true, 0: true } },
});

const ORG_RECEIPT_SETTINGS_SELECT = "name,company_address,company_phone,company_email,company_logo_url,receipt_footer,receipt_terms,whatsapp_templates,reminder_settings";

const isMissingSchemaError = error => {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("does not exist") || message.includes("could not find") || message.includes("schema cache");
};

async function loadProfileOrganization(token, profileSelect) {
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  try {
    return await supabase.query(
      `/rest/v1/profiles?id=eq.${payload.sub}&select=${profileSelect},organizations(${ORG_RECEIPT_SETTINGS_SELECT})&limit=1`,
      token,
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return supabase.query(
      `/rest/v1/profiles?id=eq.${payload.sub}&select=${profileSelect},organizations(name)&limit=1`,
      token,
    );
  }
}

export async function loadWorkspace(token) {
  const rows = await loadProfileOrganization(token, "id,full_name,role,is_active");
  const profile = rows[0];
  const organization = Array.isArray(profile?.organizations) ? profile.organizations[0] : profile?.organizations;
  if (profile?.role !== "owner" && profile?.role !== "staff") throw new Error("Could not load workspace role.");
  return {
    businessName: organization?.name || "My Finance Business",
    fullName: profile?.full_name || "",
    role: profile.role,
    active: profile?.is_active !== false,
    id: profile?.id || "",
    organizationSettings: mapOrganizationSettings(organization),
  };
}

export async function loadOrganizationSettings(token) {
  const rows = await loadProfileOrganization(token, "id");
  const organization = Array.isArray(rows[0]?.organizations) ? rows[0].organizations[0] : rows[0]?.organizations;
  return mapOrganizationSettings(organization);
}

export async function saveOrganizationSettings(token, settings) {
  return supabase.rpc("update_organization_receipt_settings", {
    input_company_name: settings.companyName || null,
    input_company_address: settings.companyAddress ?? null,
    input_company_phone: settings.companyPhone ?? null,
    input_company_email: settings.companyEmail ?? null,
    input_company_logo_url: settings.companyLogoUrl ?? null,
    input_receipt_footer: settings.receiptFooter ?? null,
    input_receipt_terms: settings.receiptTerms ?? null,
    input_whatsapp_templates: settings.whatsappTemplates ?? null,
    input_reminder_settings: settings.reminderSettings ?? null,
  }, token);
}

export const logReceiptActivity = (token, paymentSource, paymentId, action) => supabase.rpc("log_receipt_activity", {
  input_payment_source: paymentSource,
  input_payment_id: paymentId,
  input_action: action,
}, token);

export const markPaymentReminderSent = (token, reminderSource, sourceId, cycleKey, daysBefore) => supabase.rpc("mark_payment_reminder_sent", {
  input_reminder_source: reminderSource,
  input_source_id: sourceId,
  input_cycle_key: cycleKey,
  input_days_before: daysBefore,
}, token);

export const loadPaymentReminderLog = async token => {
  try {
    return await supabase.query("/rest/v1/payment_reminder_log?select=reminder_source,source_id,cycle_key,days_before,sent_at&order=sent_at.desc", token);
  } catch (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
};

const schemeInFilter = schemeIds => (schemeIds.length ? `in.(${schemeIds.join(",")})` : "");

async function querySchemeRows(token, table, schemeIds, order = "due_date.asc") {
  if (!schemeIds.length) return [];
  try {
    return await supabase.query(`/rest/v1/${table}?scheme_id=${schemeInFilter(schemeIds)}&select=*&order=${order}`, token);
  } catch (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
}

async function loadUpcomingChitPaymentsFromSchemes(token) {
  const schemes = (await loadChitSchemes(token).catch(() => [])).filter(scheme => scheme.status === "active");
  if (!schemes.length) return [];

  const schemeIds = schemes.map(scheme => scheme.id);
  const enrollments = await supabase.query(
    `/rest/v1/chit_enrollments?scheme_id=${schemeInFilter(schemeIds)}&select=id,scheme_id,status,chit_members(full_name,phone)&status=eq.active&order=scheme_id.asc,ticket_number.asc`,
    token,
  ).catch(() => []);

  const rows = [];
  const enrollmentsFor = schemeId => (enrollments || []).filter(item => item.scheme_id === schemeId);

  const auctionSchemes = schemes.filter(scheme => (scheme.chit_type || CHIT_TYPES.AUCTION) === CHIT_TYPES.AUCTION);
  if (auctionSchemes.length) {
    const auctionSchemeIds = auctionSchemes.map(scheme => scheme.id);
    const cycles = await querySchemeRows(token, "chit_cycles", auctionSchemeIds, "cycle_number.asc");
    const cycleIds = cycles.map(cycle => cycle.id);
    let installments = [];
    if (cycleIds.length) {
      try {
        installments = await supabase.query(
          `/rest/v1/chit_installments?cycle_id=in.(${cycleIds.join(",")})&select=*&order=due_date.asc`,
          token,
        );
      } catch (error) {
        if (!isMissingSchemaError(error)) throw error;
      }
    }
    auctionSchemes.forEach(scheme => {
      const schemeCycles = cycles.filter(cycle => cycle.scheme_id === scheme.id);
      const cycleIdSet = new Set(schemeCycles.map(cycle => cycle.id));
      rows.push(...flattenSchemePaymentsForReminders(scheme, {
        enrollments: enrollmentsFor(scheme.id),
        cycles: schemeCycles,
        installments: installments.filter(item => cycleIdSet.has(item.cycle_id)),
      }));
    });
  }

  const fixedSchemes = schemes.filter(scheme => scheme.chit_type === CHIT_TYPES.FIXED);
  if (fixedSchemes.length) {
    const fixedSchemeIds = fixedSchemes.map(scheme => scheme.id);
    const [fixedPayments, fixedLifts] = await Promise.all([
      querySchemeRows(token, "fixed_chit_payments", fixedSchemeIds, "payment_month.asc"),
      querySchemeRows(token, "fixed_chit_lifts", fixedSchemeIds, "month_number.asc"),
    ]);
    fixedSchemes.forEach(scheme => {
      rows.push(...flattenSchemePaymentsForReminders(scheme, {
        enrollments: enrollmentsFor(scheme.id),
        fixedPayments: fixedPayments.filter(item => item.scheme_id === scheme.id),
        fixedLifts: fixedLifts.filter(item => item.scheme_id === scheme.id),
      }));
    });
  }

  const predefinedSchemes = schemes.filter(scheme => scheme.chit_type === CHIT_TYPES.FIXED_PREDEFINED_BID);
  if (predefinedSchemes.length) {
    const predefinedSchemeIds = predefinedSchemes.map(scheme => scheme.id);
    const [predefinedPayments, predefinedSchedule] = await Promise.all([
      querySchemeRows(token, "predefined_chit_payments", predefinedSchemeIds, "payment_month.asc"),
      querySchemeRows(token, "predefined_chit_schedule", predefinedSchemeIds, "month_number.asc"),
    ]);
    predefinedSchemes.forEach(scheme => {
      rows.push(...flattenSchemePaymentsForReminders(scheme, {
        enrollments: enrollmentsFor(scheme.id),
        predefinedPayments: predefinedPayments.filter(item => item.scheme_id === scheme.id),
        predefinedSchedule: predefinedSchedule.filter(item => item.scheme_id === scheme.id),
      }));
    });
  }

  return rows;
}

export async function loadUpcomingChitPayments(token) {
  return loadUpcomingChitPaymentsFromSchemes(token);
}

export const fetchChitInstallmentById = (token, id) => supabase.query(`/rest/v1/chit_installments?id=eq.${id}&select=*`, token).then(rows => rows[0]);
export const fetchFixedChitPaymentById = (token, id) => supabase.query(`/rest/v1/fixed_chit_payments?id=eq.${id}&select=*`, token).then(rows => rows[0]);
export const fetchPredefinedChitPaymentById = (token, id) => supabase.query(`/rest/v1/predefined_chit_payments?id=eq.${id}&select=*`, token).then(rows => rows[0]);

export async function fetchFinancePaymentReceipt(token, paymentId) {
  const selectWithReceipt = "id,receipt_number,paid_on,mode,total_amount,interest_amount,principal_amount,penalty_amount,payment_reference,notes,cash_amount,upi_amount,collected_by,created_at,profiles!payments_collected_by_fkey(full_name)";
  const selectBasic = "id,paid_on,mode,total_amount,interest_amount,principal_amount,penalty_amount,payment_reference,notes,cash_amount,upi_amount,collected_by,created_at,profiles!payments_collected_by_fkey(full_name)";
  let rows;
  try {
    rows = await supabase.query(`/rest/v1/payments?id=eq.${paymentId}&select=${selectWithReceipt}`, token);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    rows = await supabase.query(`/rest/v1/payments?id=eq.${paymentId}&select=${selectBasic}`, token);
  }
  const payment = rows[0];
  if (!payment) return null;
  const profile = Array.isArray(payment.profiles) ? payment.profiles[0] : payment.profiles;
  return {
    id: payment.id,
    receiptNumber: payment.receipt_number || "",
    date: payment.paid_on,
    mode: payment.mode,
    amount: asNumber(payment.total_amount),
    interestAmount: asNumber(payment.interest_amount),
    principalAmount: asNumber(payment.principal_amount),
    penaltyAmount: asNumber(payment.penalty_amount),
    ref: payment.payment_reference || "",
    notes: payment.notes || "",
    cashAmount: asNumber(payment.cash_amount),
    upiAmount: asNumber(payment.upi_amount),
    collectedBy: payment.collected_by || "",
    collectorName: profile?.full_name || "Financier/Admin",
    createdAt: payment.created_at || "",
  };
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
      cashAmount: asNumber(payment.cash_amount), upiAmount: asNumber(payment.upi_amount),
      collectedBy: payment.collected_by || "", collectorName: (Array.isArray(payment.profiles) ? payment.profiles[0] : payment.profiles)?.full_name || "Financier/Admin",
      receiptNumber: payment.receipt_number || "",
      createdAt: payment.created_at || "",
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
  const paymentId = await supabase.rpc("record_finance_payment", {
    account_id: loan.id, payment_date: payment.date, payment_mode: payment.mode,
    amount_total: payment.amount,
    amount_interest: payment.interestAmount || 0, amount_principal: payment.principalAmount || 0,
    amount_penalty: payment.penaltyAmount || 0, payment_ref: payment.ref || "", payment_notes: payment.notes || "",
    payment_cash_amount: payment.cashAmount || 0, payment_upi_amount: payment.upiAmount || 0,
  }, token);
  const receipt = await fetchFinancePaymentReceipt(token, paymentId);
  return { paymentId, transaction: receipt };
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
export const updateFinancePayment = (token, payment) => supabase.rpc("update_finance_payment", { payment_id: payment.id, payment_date: payment.date, payment_mode: payment.mode, amount_total: payment.amount, amount_interest: payment.interestAmount || 0, amount_principal: payment.principalAmount || 0, amount_penalty: payment.penaltyAmount || 0, payment_ref: payment.ref || "", payment_notes: payment.notes || "", payment_cash_amount: payment.cashAmount || 0, payment_upi_amount: payment.upiAmount || 0 }, token);
export const deleteFinancePayment = (token, paymentId) => supabase.rpc("delete_finance_payment", { payment_id: paymentId }, token);
export const setAccountStatus = (token, accountId, status, note) => supabase.rpc("set_finance_account_status", { account_id: accountId, new_status: status, action_note: note || "" }, token);
export const saveCollectionOrder = (token, accountIds) => supabase.rpc("set_collection_order", { account_ids: accountIds }, token);
export const createCollectionAgent = async (token, details) => {
  const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(details) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not create collection agent");
  return body;
};
export const loadManagedAgents = async token => {
  const response = await fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => []);
  if (!response.ok) throw new Error(body.error || "Could not load collection agents");
  return body;
};
export const updateCollectionAgent = async (token, details) => {
  const response = await fetch("/api/agents", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(details) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not update collection staff");
  return body;
};
export const loadCollectionAgents = token => supabase.query("/rest/v1/profiles?select=id,full_name,role&role=eq.staff&order=full_name.asc", token);
export const assignCollectionAgent = (token, accountId, agentId) => supabase.rpc("assign_collection_agent", { account_id: accountId, agent_id: agentId || null }, token);
export const assignCollectionAgents = async (token, assignments = []) => {
  if (!assignments.length) return;
  try {
    await supabase.rpc("assign_collection_agents_batch", { input_assignments: assignments }, token);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    for (const row of assignments) {
      await assignCollectionAgent(token, row.account_id, row.agent_id || null);
    }
  }
};
export const loadChitSchemes = token => supabase.query(`/rest/v1/chit_schemes?select=${CHIT_SCHEME_LIST_COLUMNS}&order=start_date.desc`, token);
export const loadActiveChitSchemes = token => supabase.query(`/rest/v1/chit_schemes?select=${CHIT_ACTIVE_SCHEME_COLUMNS}&status=eq.active&order=start_date.desc`, token);
export const loadChitMembers = token => supabase.query("/rest/v1/chit_members?select=id,full_name,phone,address,created_at,updated_at&order=full_name.asc", token);
export const createChitScheme = (token, scheme) => supabase.rpc("chit_create_scheme", {
  scheme_name: scheme.name, scheme_chit_value: Number(scheme.chitValue), scheme_duration_months: Number(scheme.durationMonths),
  scheme_member_count: Number(scheme.memberCount), scheme_installment_amount: Number(scheme.installmentAmount),
  scheme_commission_percent: Number(scheme.commissionPercent), scheme_start_date: scheme.startDate,
  scheme_min_bid_percent: Number(scheme.minBidPercent), scheme_max_bid_percent: Number(scheme.maxBidPercent),
  scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0), scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const createFixedChitScheme = (token, scheme) => supabase.rpc("chit_create_fixed_scheme", {
  scheme_name: scheme.name, scheme_chit_value: Number(scheme.chitValue),
  scheme_duration_months: Number(scheme.durationMonths), scheme_member_count: Number(scheme.memberCount),
  scheme_installment_amount: Number(scheme.installmentAmount),
  scheme_commission_amount: Number(scheme.fixedCommissionAmount),
  scheme_commission_percent: Number(scheme.commissionPercent),
  scheme_initial_lift_amount: Number(scheme.fixedInitialLiftAmount),
  scheme_monthly_increment: Number(scheme.fixedMonthlyIncrement),
  scheme_start_date: scheme.startDate,
  scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0),
  scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const createPredefinedBidChitScheme = (token, scheme) => supabase.rpc("chit_create_predefined_bid_scheme", {
  scheme_name: scheme.name, scheme_chit_value: Number(scheme.chitValue),
  scheme_duration_months: Number(scheme.durationMonths), scheme_member_count: Number(scheme.memberCount),
  scheme_start_date: scheme.startDate, scheme_starting_emi: Number(scheme.predefinedStartingEmi),
  scheme_emi_increment: Number(scheme.predefinedEmiIncrement),
  scheme_starting_comm: Number(scheme.predefinedStartingComm),
  scheme_comm_decrement: Number(scheme.predefinedCommDecrement),
  scheme_starting_auction_amount: Number(scheme.predefinedStartingAuctionAmount),
  scheme_auction_decrement: Number(scheme.predefinedAuctionDecrement),
  scheme_starting_bid_amount: Number(scheme.predefinedStartingBidAmount),
  scheme_bid_increment: Number(scheme.predefinedBidIncrement),
  scheme_manager_commission_percent: Number(scheme.predefinedManagerCommissionPercent),
  scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0),
  scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const createChitMember = (token, member) => supabase.rpc("chit_create_member", {
  member_name: member.name, member_phone: member.phone, member_address: member.address || null,
  member_aadhaar_ciphertext: member.aadhaar || null, member_pan_ciphertext: member.pan || null,
}, token);
export const enrollChitMember = (token, enrollment) => supabase.rpc("chit_enroll_member", {
  input_scheme_id: enrollment.schemeId, input_member_id: enrollment.memberId, input_ticket_number: Number(enrollment.ticketNumber),
  input_guarantor_name: enrollment.guarantorName, input_guarantor_phone: enrollment.guarantorPhone,
  input_guarantor_address: enrollment.guarantorAddress || null, input_security_deposit: Number(enrollment.securityDeposit || 0),
}, token);
export const updateEnrolledChitMember = (token, enrollment) => supabase.rpc("chit_update_enrolled_member", {
  input_enrollment_id: enrollment.id, input_member_name: enrollment.name,
  input_member_phone: enrollment.phone, input_member_address: enrollment.address || null,
  input_guarantor_name: enrollment.guarantorName,
  input_guarantor_phone: enrollment.guarantorPhone,
  input_guarantor_address: enrollment.guarantorAddress || null,
  input_security_deposit: Number(enrollment.securityDeposit || 0),
}, token);
export const deleteEnrolledChitMember = (token, enrollmentId) => supabase.rpc("chit_delete_enrolled_member", {
  input_enrollment_id: enrollmentId,
}, token);
export const deleteChitScheme = (token, schemeId) => supabase.rpc("chit_delete_scheme", {
  input_scheme_id: schemeId,
}, token);
export const activateChitScheme = (token, schemeId) => supabase.rpc("chit_activate_scheme", { input_scheme_id: schemeId }, token);
export const recordChitMonthlyBid = (token, bid) => supabase.rpc("chit_record_monthly_bid", {
  input_scheme_id: bid.schemeId, input_cycle_number: Number(bid.cycleNumber), input_cycle_date: bid.cycleDate,
  input_winning_enrollment_id: bid.winningEnrollmentId, input_winning_bid_amount: Number(bid.winningBidAmount), input_notes: bid.notes || null,
}, token);
export const updateChitScheme = (token, scheme) => supabase.rpc("chit_update_scheme", {
  input_scheme_id: scheme.id, scheme_name: scheme.name, scheme_chit_value: Number(scheme.chitValue), scheme_duration_months: Number(scheme.durationMonths),
  scheme_member_count: Number(scheme.memberCount), scheme_installment_amount: Number(scheme.installmentAmount), scheme_start_date: scheme.startDate,
  scheme_commission_percent: Number(scheme.commissionPercent), scheme_min_bid_percent: Number(scheme.minBidPercent),
  scheme_max_bid_percent: Number(scheme.maxBidPercent), scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0),
  scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const updateFixedChitScheme = (token, scheme) => supabase.rpc("chit_update_fixed_scheme", {
  input_scheme_id: scheme.id, scheme_name: scheme.name,
  scheme_chit_value: Number(scheme.chitValue), scheme_duration_months: Number(scheme.durationMonths),
  scheme_member_count: Number(scheme.memberCount), scheme_installment_amount: Number(scheme.installmentAmount),
  scheme_commission_amount: Number(scheme.fixedCommissionAmount),
  scheme_commission_percent: Number(scheme.commissionPercent),
  scheme_initial_lift_amount: Number(scheme.fixedInitialLiftAmount),
  scheme_monthly_increment: Number(scheme.fixedMonthlyIncrement),
  scheme_start_date: scheme.startDate,
  scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0),
  scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const loadChitSchemeDetails = async (token, schemeId) => {
  const enrollmentSelect = async extra => supabase.query(`/rest/v1/chit_enrollments?scheme_id=eq.${schemeId}&select=*,chit_members(full_name,phone,address)${extra}&order=ticket_number.asc`, token);
  const enrollmentPromise = enrollmentSelect(",chit_member_portal_credentials(portal_id)").catch(() => enrollmentSelect(""));
  const [enrollments, cycles, fixedLifts, fixedPayments, predefinedSchedule, predefinedPayments] = await Promise.all([
    enrollmentPromise,
    supabase.query(`/rest/v1/chit_cycles?scheme_id=eq.${schemeId}&select=*&order=cycle_number.asc`, token),
    supabase.query(`/rest/v1/fixed_chit_lifts?scheme_id=eq.${schemeId}&select=*&order=month_number.asc`, token).catch(() => []),
    supabase.query(`/rest/v1/fixed_chit_payments?scheme_id=eq.${schemeId}&select=*&order=payment_month.asc`, token).catch(() => []),
    supabase.query(`/rest/v1/predefined_chit_schedule?scheme_id=eq.${schemeId}&select=*&order=month_number.asc`, token).catch(() => []),
    supabase.query(`/rest/v1/predefined_chit_payments?scheme_id=eq.${schemeId}&select=*&order=payment_month.asc`, token).catch(() => []),
  ]);
  const members = sortMembersByName(enrollments);
  const cycleIds = cycles.map(cycle => cycle.id);
  if (!cycleIds.length) {
    return { enrollments: members, cycles, bids: [], installments: [], fixedLifts, fixedPayments, predefinedSchedule, predefinedPayments };
  }
  const cycleFilter = cycleIds.join(",");
  const [bids, installments] = await Promise.all([
    supabase.query(`/rest/v1/chit_bids?cycle_id=in.(${cycleFilter})&select=*`, token),
    supabase.query(`/rest/v1/chit_installments?cycle_id=in.(${cycleFilter})&select=*&order=due_date.desc`, token),
  ]);
  return { enrollments: members, cycles, bids, installments, fixedLifts, fixedPayments, predefinedSchedule, predefinedPayments };
};
export const updateChitInstallmentPayment = (token, payment) => supabase.rpc("chit_update_installment_payment", {
  input_installment_id: payment.id, input_amount_paid: Number(payment.amountPaid), input_paid_date: payment.paidDate || null,
  input_payment_mode: payment.paymentMode || null, input_payment_reference: payment.paymentReference || null,
  input_cash_amount: Number(payment.cashAmount || 0), input_upi_amount: Number(payment.upiAmount || 0), input_notes: payment.notes || null,
}, token);
export const recordChitInstallmentPayment = updateChitInstallmentPayment;
export const deleteChitInstallmentPayment = (token, paymentId) => supabase.rpc("chit_delete_installment_payment", { input_installment_id: paymentId }, token);
export const finalizeFixedChitLift = (token, lift) => supabase.rpc("chit_finalize_fixed_lift", {
  input_scheme_id: lift.schemeId, input_month_number: Number(lift.monthNumber),
  input_enrollment_id: lift.enrollmentId, input_lift_date: lift.liftDate,
}, token);
export const updateFixedChitPayment = (token, payment) => supabase.rpc("chit_update_fixed_payment", {
  input_payment_id: payment.id, input_amount_paid: Number(payment.amountPaid),
  input_paid_date: payment.paidDate, input_payment_mode: payment.paymentMode,
  input_payment_reference: payment.paymentReference || null, input_notes: payment.notes || null,
  input_cash_amount: Number(payment.cashAmount || 0), input_upi_amount: Number(payment.upiAmount || 0),
}, token);
export const deleteFixedChitPayment = (token, paymentId) => supabase.rpc("chit_delete_fixed_payment", {
  input_payment_id: paymentId,
}, token);
export const updatePredefinedChitScheduleMonth = (token, item) => supabase.rpc("chit_update_predefined_schedule_month", {
  input_schedule_id: item.id, input_emi: Number(item.emi), input_comm_amount: Number(item.commAmount),
  input_auction_amount: Number(item.auctionAmount), input_bid_amount: Number(item.bidAmount),
  input_manager_commission_percent: Number(item.managerCommissionPercent),
}, token);
export const finalizePredefinedChitMonth = (token, item) => supabase.rpc("chit_finalize_predefined_month", {
  input_schedule_id: item.id, input_enrollment_id: item.enrollmentId, input_assigned_date: item.assignedDate,
}, token);
export const updatePredefinedChitPayment = (token, payment) => supabase.rpc("chit_update_predefined_payment", {
  input_payment_id: payment.id, input_amount_paid: Number(payment.amountPaid),
  input_paid_date: payment.paidDate, input_payment_mode: payment.paymentMode,
  input_payment_reference: payment.paymentReference || null, input_notes: payment.notes || null,
  input_cash_amount: Number(payment.cashAmount || 0), input_upi_amount: Number(payment.upiAmount || 0),
}, token);
export const deletePredefinedChitPayment = (token, paymentId) => supabase.rpc("chit_delete_predefined_payment", {
  input_payment_id: paymentId,
}, token);
export const loadChitDashboard = async (token, { force = false } = {}) => {
  if (!force) {
    const cached = readChitDashboardCache(token);
    if (cached) return cached;
  }
  const [schemes, related] = await Promise.all([
    loadChitSchemes(token),
    loadChitBoardRelated(token),
  ]);
  const payload = { schemes, ...related };
  writeChitDashboardCache(token, payload);
  return payload;
};
export const loadChitLiveAuction = (token, schemeId) => supabase.rpc("chit_live_auction_snapshot", { input_scheme_id: schemeId }, token);
export const startChitLiveAuction = (token, schemeId, cycleNumber, cycleDate) => {
  const args = { input_scheme_id: schemeId };
  if (cycleNumber != null && cycleNumber !== "") args.input_cycle_number = Number(cycleNumber);
  if (cycleDate) args.input_cycle_date = cycleDate;
  return supabase.rpc("chit_start_live_auction", args, token);
};
export const pauseChitLiveAuction = (token, schemeId) => supabase.rpc("chit_pause_live_auction", { input_scheme_id: schemeId }, token);
export const placeChitLiveBid = (token, auctionId, enrollmentId, bidAmount, clientNonce) => supabase.rpc("chit_place_live_bid", {
  input_auction_id: auctionId, input_enrollment_id: enrollmentId, input_bid_amount: Number(bidAmount), input_client_nonce: clientNonce,
}, token);
export const endChitLiveAuction = (token, auctionId) => supabase.rpc("chit_end_live_auction", { input_auction_id: auctionId }, token);
export const enableChitMemberPortal = (token, enrollmentId, pin) => supabase.rpc("enable_chit_member_portal", { input_enrollment_id: enrollmentId, new_pin: pin }, token);
export const resetChitMemberPortalPin = (token, enrollmentId, pin) => supabase.rpc("reset_chit_member_portal_pin", { input_enrollment_id: enrollmentId, new_pin: pin }, token);
export const chitCustomerPortalLogin = (portalId, pin) => supabase.rpc("chit_customer_portal_login", { input_portal_id: portalId, input_pin: pin });
export const chitCustomerLiveState = sessionToken => supabase.rpc("chit_customer_live_state", { input_session_token: sessionToken });
export const chitCustomerPaymentHistory = sessionToken => supabase.rpc("chit_customer_payment_history", { input_session_token: sessionToken });
export const chitCustomerSelectMembership = (sessionToken, enrollmentId) => supabase.rpc("chit_customer_select_membership", {
  input_session_token: sessionToken, input_enrollment_id: enrollmentId,
});
export const chitCustomerPlaceLiveBid = (sessionToken, bidAmount, clientNonce) => supabase.rpc("chit_customer_place_live_bid", {
  input_session_token: sessionToken, input_bid_amount: Number(bidAmount), input_client_nonce: clientNonce,
});
