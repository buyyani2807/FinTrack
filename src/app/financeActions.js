import { mergeAccountTransaction } from "../features/finance/paymentState.js";
import { assignCollectionAgents, createCollectionAgent, createFinanceAccount, deleteFinanceAccount, deleteFinancePayment, enableCustomerPortal, loadCustomerKyc, loadManagedAgents, logReceiptActivity, recordPayment, resetCustomerPortalPin, saveCollectionOrder, saveCustomerKyc, setAccountStatus, updateCollectionAgent, updateFinanceAccount, updateFinancePayment, updatePaymentNotes } from "../lib/financeRepository";

const generateCustomerPortalPin = () => String(100000 + Math.floor(Math.random() * 900000));

// Finance account, payment and staff operations for the signed-in user; each refreshes accounts where needed.
export function useFinanceActions({ user, setLoans, refreshLoans }) {
  const createLoan = async loan => {
    const accountId = await createFinanceAccount(user.authToken, loan);
    if (loan.aadhaar || loan.pan) await saveCustomerKyc(user.authToken, accountId, loan.aadhaar || "", loan.pan || "");
    const pin = generateCustomerPortalPin();
    let portalId = "";
    try {
      portalId = await enableCustomerPortal(user.authToken, accountId, pin);
    } catch (error) {
      await refreshLoans();
      throw new Error(error?.message || "Account was created, but customer portal could not be enabled. Open the customer and use Enable customer portal.");
    }
    await refreshLoans();
    return { portalId, pin, accountId };
  };
  const savePayment = async (loan, payment) => {
    const result = await recordPayment(user.authToken, loan, payment);
    if (result?.transaction) {
      setLoans(current => mergeAccountTransaction(current, loan.id, result.transaction));
    }
    refreshLoans(user.authToken);
    return result;
  };
  const logReceipt = (token, source, paymentId, action) => {
    const mapped = source === "finance" ? "finance" : source === "chit_auction" ? "chit_auction" : source === "chit_fixed" ? "chit_fixed" : "chit_predefined";
    return logReceiptActivity(token, mapped, paymentId, action);
  };
  const updateLoan = async loan => { await updateFinanceAccount(user.authToken, loan); await refreshLoans(); };
  const removeLoan = async loan => { await deleteFinanceAccount(user.authToken, loan.id); await refreshLoans(); };
  const saveCustomerPortal = async (loan, pin) => { const portalId = loan.portalId ? (await resetCustomerPortalPin(user.authToken, loan.id, pin), "") : await enableCustomerPortal(user.authToken, loan.id, pin); await refreshLoans(); return portalId; };
  const getKyc = loan => loadCustomerKyc(user.authToken, loan.id);
  const updateKyc = (loan, aadhaar, pan) => saveCustomerKyc(user.authToken, loan.id, aadhaar, pan);
  const changeStatus = async (loan, status, note) => {
    const isClosing = status === "closed", isBankrupt = status === "bankrupt";
    const resolvedNote = note ?? (isClosing || isBankrupt ? "" : "Account reopened by financier");
    if ((isClosing || isBankrupt) && !resolvedNote?.trim()) return;
    await setAccountStatus(user.authToken, loan.id, status, resolvedNote);
    await refreshLoans();
  };
  const changePaymentNotes = async (payment, notes) => { await updatePaymentNotes(user.authToken, payment.id, notes); await refreshLoans(); };
  const correctPayment = async payment => { await updateFinancePayment(user.authToken, payment); await refreshLoans(); };
  const removePayment = async payment => { await deleteFinancePayment(user.authToken, payment.id); await refreshLoans(); };
  const changeCollectionOrder = async ids => { await saveCollectionOrder(user.authToken, ids); await refreshLoans(); };
  const addCollectionAgent = details => createCollectionAgent(user.authToken, details);
  const getManagedAgents = () => loadManagedAgents(user.authToken);
  const updateAgentAssignment = async assignments => { await assignCollectionAgents(user.authToken, assignments); await refreshLoans(); };
  const saveCollectionStaff = details => updateCollectionAgent(user.authToken, details);
  return { createLoan, savePayment, logReceipt, updateLoan, removeLoan, saveCustomerPortal, getKyc, updateKyc, changeStatus, changePaymentNotes, correctPayment, removePayment, changeCollectionOrder, addCollectionAgent, getManagedAgents, updateAgentAssignment, saveCollectionStaff };
}
