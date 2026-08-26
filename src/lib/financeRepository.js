import { supabase } from "./supabase";

const asNumber = value => Number(value || 0);

export async function loadWorkspace(token) {
  const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const rows = await supabase.query(`/rest/v1/profiles?id=eq.${payload.sub}&select=id,full_name,role,is_active,organizations(name)&limit=1`, token);
  const profile = rows[0];
  const organization = Array.isArray(profile?.organizations) ? profile.organizations[0] : profile?.organizations;
  return { businessName: organization?.name || "My Finance Business", fullName: profile?.full_name || "", role: profile?.role || "owner", active: profile?.is_active !== false, id: profile?.id || "" };
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
    payment_cash_amount: payment.cashAmount || 0, payment_upi_amount: payment.upiAmount || 0,
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
export const loadChitSchemes = token => supabase.query("/rest/v1/chit_schemes?select=*&order=start_date.desc", token);
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
  scheme_initial_lift_amount: Number(scheme.fixedInitialLiftAmount),
  scheme_monthly_increment: Number(scheme.fixedMonthlyIncrement),
  scheme_start_date: scheme.startDate,
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
  scheme_initial_lift_amount: Number(scheme.fixedInitialLiftAmount),
  scheme_monthly_increment: Number(scheme.fixedMonthlyIncrement),
  scheme_start_date: scheme.startDate,
  scheme_late_penalty_amount: Number(scheme.latePenaltyAmount || 0),
  scheme_security_deposit_amount: Number(scheme.securityDepositAmount || 0),
}, token);
export const loadChitSchemeDetails = async (token, schemeId) => {
  const enrollmentSelect = async extra => supabase.query(`/rest/v1/chit_enrollments?scheme_id=eq.${schemeId}&select=*,chit_members(full_name,phone,address)${extra}&order=ticket_number.asc`, token);
  const [enrollments, cycles] = await Promise.all([
    enrollmentSelect(",chit_member_portal_credentials(portal_id)").catch(() => enrollmentSelect("")),
    supabase.query(`/rest/v1/chit_cycles?scheme_id=eq.${schemeId}&select=*&order=cycle_number.asc`, token),
  ]);
  const cycleIds = cycles.map(cycle => cycle.id);
  const [fixedLifts, fixedPayments] = await Promise.all([
    supabase.query(`/rest/v1/fixed_chit_lifts?scheme_id=eq.${schemeId}&select=*&order=month_number.asc`, token).catch(() => []),
    supabase.query(`/rest/v1/fixed_chit_payments?scheme_id=eq.${schemeId}&select=*&order=payment_month.asc`, token).catch(() => []),
  ]);
  if (!cycleIds.length) return { enrollments, cycles, bids: [], installments: [], fixedLifts, fixedPayments };
  const cycleFilter = cycleIds.join(",");
  const [bids, installments] = await Promise.all([
    supabase.query(`/rest/v1/chit_bids?cycle_id=in.(${cycleFilter})&select=*`, token),
    supabase.query(`/rest/v1/chit_installments?cycle_id=in.(${cycleFilter})&select=*&order=due_date.desc`, token),
  ]);
  return { enrollments, cycles, bids, installments, fixedLifts, fixedPayments };
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
}, token);
export const deleteFixedChitPayment = (token, paymentId) => supabase.rpc("chit_delete_fixed_payment", {
  input_payment_id: paymentId,
}, token);
export const loadChitDashboard = async token => {
  const [schemes, cycles, enrollments, fixedLifts] = await Promise.all([
    loadChitSchemes(token),
    supabase.query("/rest/v1/chit_cycles?select=id,scheme_id,cycle_number,cycle_date,winning_bid_amount,winning_enrollment_id,status,discount_amount,commission_amount,distributable_amount,dividend_per_member&order=cycle_number.asc", token),
    supabase.query("/rest/v1/chit_enrollments?select=id,scheme_id,ticket_number,status,chit_members(full_name)&order=ticket_number.asc", token),
    supabase.query("/rest/v1/fixed_chit_lifts?select=*&order=month_number.asc", token).catch(() => []),
  ]);
  return { schemes, cycles, enrollments, fixedLifts };
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
export const chitCustomerPlaceLiveBid = (sessionToken, bidAmount, clientNonce) => supabase.rpc("chit_customer_place_live_bid", {
  input_session_token: sessionToken, input_bid_amount: Number(bidAmount), input_client_nonce: clientNonce,
});
