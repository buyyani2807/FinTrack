import { addDaysIso } from "./model/accountingModel.js";
import { todayIso } from "../../lib/dates.js";
import { emptyItemLine } from "./model/inventoryModel.js";

export const emptyLine = () => ({ coaId: "", debit: "", credit: "", description: "" });
export const emptyBankLine = () => ({ lineDate: todayIso(), description: "", reference: "", amount: "", direction: "in" });
export const emptyPartyForm = () => ({ id: null, partyType: "customer", name: "", phone: "", email: "", address: "", gstin: "", stateCode: "", gstRegistration: "", notes: "", creditLimit: "", creditDays: "" });
export const emptyRecurringDraft = () => ({
  id: null,
  name: "",
  kind: "sale",
  frequency: "monthly",
  nextRunOn: todayIso(),
  amount: "",
  partyId: "",
  narration: "",
  mode: "cash",
  isActive: true,
});
export const RECURRING_KINDS = [
  { id: "sale", label: "Sale" },
  { id: "expense", label: "Expense" },
  { id: "purchase", label: "Purchase" },
  { id: "receipt", label: "Receipt" },
  { id: "payment", label: "Payment" },
];
export const RECURRING_FREQUENCIES = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
];
export const emptyVoucherForm = () => ({ date: todayIso(), narration: "", partyId: "", dueDate: addDaysIso(todayIso(), 7) });
export const emptySimpleForm = () => ({
  date: todayIso(),
  amount: "",
  partyId: "",
  moneyMode: "cash",
  settlement: "credit",
  expenseCode: "5000",
  fromType: "cash",
  toType: "bank",
  fromAccountId: "",
  toAccountId: "",
  dueDate: addDaysIso(todayIso(), 7),
  narration: "",
  gstRate: "18",
  hsnSac: "",
  taxInclusive: false,
  entryMode: "items",
  noteEntryMode: "amount",
  itemLines: [emptyItemLine()],
  settlements: [],
  amountReceived: "",
  receivedCash: "",
  receivedUpi: "",
});
export const emptyCoaForm = () => ({
  id: null,
  code: "",
  name: "",
  groupType: "expense",
  accountType: "expense",
  openingBalance: "",
  openingSide: "debit",
  isSystem: false,
  parentId: "",
});
