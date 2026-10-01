import {
  loadAccountingSettings,
  loadAccountsCompanies,
  loadChartOfAccounts,
  loadParties,
  loadPartyPipeline,
  loadVouchers,
  loadItemCategories,
  loadItems,
  loadStockMovements,
  loadVoucherItemLines,
  setActiveAccountsCompanyId,
  loadRecurringTemplates,
} from "./accountingRepository.js";

export const COMPANY_STORAGE_KEY = "fintrack-accounts-company";
// Last loaded books, kept in memory only for this tab and session token, so
// reopening Accounts renders immediately while refresh() revalidates.
let accountsSnapshot = null;
let accountsPrefetch = null;
export const readAccountsSnapshot = token => (token && accountsSnapshot?.token === token ? accountsSnapshot : null);
const orEmptyWhenMigrating = promise => promise.catch(err => { if (err.code === "MIGRATION_REQUIRED") return []; throw err; });
export async function fetchAccountsBundle(token, { preferredCompanyId, wantRecurring = true } = {}) {
  let companies = [];
  try {
    companies = await loadAccountsCompanies(token);
  } catch (err) {
    if (err.code !== "MIGRATION_REQUIRED") throw err;
  }
  let stored = "";
  try { stored = sessionStorage.getItem(COMPANY_STORAGE_KEY) || ""; } catch { stored = ""; }
  const activeCompanies = companies.filter(item => item.status !== "archived");
  const company = (preferredCompanyId && activeCompanies.find(item => item.id === preferredCompanyId))
    || activeCompanies.find(item => item.id === stored)
    || activeCompanies.find(item => item.isPrimary)
    || activeCompanies[0]
    || null;
  setActiveAccountsCompanyId(company?.id || null);
  if (company) {
    try { sessionStorage.setItem(COMPANY_STORAGE_KEY, company.id); } catch { /* ignore */ }
  }
  const [settings, accounts, parties, pipeline, vouchers, items, itemCategories, stockMovements, voucherItemLines, recurring] = await Promise.all([
    loadAccountingSettings(token),
    loadChartOfAccounts(token),
    loadParties(token),
    orEmptyWhenMigrating(loadPartyPipeline(token)),
    loadVouchers(token),
    orEmptyWhenMigrating(loadItems(token)),
    orEmptyWhenMigrating(loadItemCategories(token)),
    orEmptyWhenMigrating(loadStockMovements(token)),
    orEmptyWhenMigrating(loadVoucherItemLines(token)),
    wantRecurring ? loadRecurringTemplates(token).catch(() => []) : Promise.resolve(null),
  ]);
  const mergedSettings = {
    ...(settings || {}),
    companyName: company?.name || settings?.companyName || "",
    booksStartedOn: company?.booksStartedOn || settings?.booksStartedOn || "",
    fyStartMonth: company?.fyStartMonth || settings?.fyStartMonth || 4,
  };
  const activeCompanyId = company?.id || "";
  const sameCompanyCache = accountsSnapshot?.token === token && accountsSnapshot.activeCompanyId === activeCompanyId;
  const bundle = {
    token,
    companies,
    activeCompanyId,
    gstForm: company ? {
      gstRegistration: company.gstRegistration || "unregistered",
      gstin: company.gstin || "",
      legalName: company.legalName || "",
      stateCode: company.stateCode || "",
    } : null,
    settings: mergedSettings,
    accounts,
    parties,
    partyPipeline: Object.fromEntries((pipeline || []).map(row => [row.partyId, row.stage])),
    vouchers,
    items: items || [],
    itemCategories: itemCategories || [],
    stockMovements: stockMovements || [],
    voucherItemLines: voucherItemLines || [],
    recurringFetched: Boolean(recurring),
    recurringTemplates: recurring || (sameCompanyCache ? accountsSnapshot.recurringTemplates : []),
  };
  accountsSnapshot = bundle;
  return bundle;
}
// Warm the Accounts books in the background (e.g. from the dashboard) so the
// first open after login skips the loading placeholders.
export function prefetchAccounts(token) {
  if (!token || readAccountsSnapshot(token) || accountsPrefetch?.token === token) return;
  const promise = fetchAccountsBundle(token);
  accountsPrefetch = { token, promise };
  promise.catch(() => {}).finally(() => {
    if (accountsPrefetch?.promise === promise) accountsPrefetch = null;
  });
}
export const inFlightAccountsPrefetch = token => (accountsPrefetch?.token === token ? accountsPrefetch.promise : null);
export const clearAccountsSnapshot = () => { accountsSnapshot = null; };
