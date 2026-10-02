import { EXPENSE_CATEGORIES, MANUAL_IN_CATEGORIES, todayIso } from "./cashbookModel.js";
import { formatInr } from "../../lib/formatMoney.js";

export const money = formatInr;
export const SECTIONS = [
  { id: "cashbook", label: "Cashbook" },
  { id: "expenses", label: "Expenses" },
  { id: "bank", label: "Bank / UPI" },
  { id: "transfers", label: "Transfers" },
  { id: "closing", label: "Day Closing" },
  { id: "reports", label: "Reports" },
];
export const PERIOD_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom" },
];
export const PERIOD_IN_OUT_LABEL = {
  today: "Today",
  week: "This week",
  month: "This month",
  custom: "Selected dates",
};
export const emptyManualForm = () => ({
  direction: "in", ledgerAccountId: "", date: todayIso(), category: MANUAL_IN_CATEGORIES[0],
  description: "", amount: "", reference: "", notes: "",
});
export const emptyExpenseForm = () => ({
  ledgerAccountId: "", date: todayIso(), category: EXPENSE_CATEGORIES[0],
  description: "", amount: "", notes: "", reference: "",
});
export const emptyTransferForm = () => ({
  fromLedgerId: "", toLedgerId: "", date: todayIso(), amount: "", description: "", notes: "",
});
export const emptyClosingForm = (ledgerAccountId = "") => ({
  ledgerAccountId, date: todayIso(), actualBalance: "", notes: "",
});
