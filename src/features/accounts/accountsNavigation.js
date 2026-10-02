export const NAV_STORAGE_KEY = "fintrack-accounts-nav";
export const NAV_TREE = [
  { id: "overview", label: "Overview", glyph: "⌂" },
  { id: "vouchers", label: "Transactions", glyph: "▣" },
  { id: "documents", label: "Documents", glyph: "▧" },
  { id: "inventory", label: "Inventory", glyph: "▤" },
  {
    id: "parties",
    label: "Parties",
    glyph: "◉",
    children: [
      { id: "parties", label: "Party Ledger" },
      { id: "receivables", label: "Receivables" },
      { id: "payables", label: "Payables" },
      { id: "routes", label: "Collection routes" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    glyph: "▦",
    children: [
      { id: "reports", label: "Day Book" },
      { id: "gst", label: "GST" },
      { id: "ledger", label: "Ledger" },
      { id: "trial", label: "Trial Balance" },
      { id: "pnl", label: "Profit & Loss" },
      { id: "balance", label: "Balance Sheet" },
    ],
  },
  { id: "bank", label: "Banking", glyph: "⬡" },
  { id: "cashbook", label: "Cashbook", glyph: "◇" },
  { id: "setup", label: "Setup", glyph: "⚙" },
];
export const navItemIsActive = (item, section) => item.children?.some(child => child.id === section) || item.id === section;
export function sectionTrail(section, reportTab) {
  if (section === "overview") return ["Overview"];
  if (section === "vouchers") return ["Transactions"];
  if (section === "inventory") return ["Inventory"];
  if (section === "documents") return ["Documents"];
  if (section === "parties") return ["Parties", "Party Ledger"];
  if (section === "receivables") return ["Parties", "Receivables"];
  if (section === "payables") return ["Parties", "Payables"];
  if (section === "routes") return ["Parties", "Collection routes"];
  if (section === "ledger") return ["Reports", "Ledger"];
  if (section === "pnl") return ["Reports", "Profit & Loss"];
  if (section === "balance") return ["Reports", "Balance Sheet"];
  if (section === "trial") return ["Reports", "Trial Balance"];
  if (section === "reports") return ["Reports", REPORT_TABS.find(item => item.id === reportTab)?.label || "Day Book"];
  if (section === "bank") return ["Banking"];
  if (section === "cashbook") return ["Cashbook"];
  if (section === "setup") return ["Setup"];
  if (section === "more") return ["More"];
  return [SECTIONS.find(item => item.id === section)?.label || "Accounts"];
}
export const SECTIONS = [
  { id: "overview", label: "Overview", group: "Books" },
  { id: "manufacturing", label: "Manufacturing", group: "Industry" },
  { id: "ledger", label: "Ledger", group: "Books" },
  { id: "vouchers", label: "Transactions", group: "Books" },
  { id: "documents", label: "Documents", group: "Books" },
  { id: "inventory", label: "Inventory", group: "Books" },
  { id: "cashbook", label: "Cashbook", group: "Books" },
  { id: "receivables", label: "Receivables", group: "Parties" },
  { id: "payables", label: "Payables", group: "Parties" },
  { id: "parties", label: "Party Ledger", group: "Parties" },
  { id: "routes", label: "Collection routes", group: "Parties" },
  { id: "crm", label: "Customer Pipeline", group: "Parties" },
  { id: "reports", label: "Reports", group: "Reports" },
  { id: "bank", label: "Bank Reconciliation", group: "Reports" },
  { id: "pnl", label: "Profit & Loss", group: "Reports" },
  { id: "balance", label: "Balance Sheet", group: "Reports" },
  { id: "trial", label: "Trial Balance", group: "Reports" },
  { id: "setup", label: "Setup", group: "Company" },
  { id: "more", label: "More", group: "Company" },
];
export const REPORT_TABS = [
  { id: "daybook", label: "Day Book" },
  { id: "trial", label: "Trial Balance" },
  { id: "pnl", label: "Accounting P&L" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "receivables", label: "Receivables" },
  { id: "payables", label: "Payables" },
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchases" },
  { id: "gst", label: "GST" },
  { id: "ledger", label: "Ledger" },
  { id: "item_sales", label: "Item Sales" },
  { id: "item_purchases", label: "Item Purchases" },
  { id: "stock_moves", label: "Stock Movement" },
];
export const MOBILE_TABS = [
  { id: "overview", label: "Home" },
  { id: "vouchers", label: "Books" },
  { id: "parties", label: "Parties" },
  { id: "reports", label: "Reports" },
  { id: "more", label: "More" },
];
const REPORT_HUB_CARDS = [
  { id: "daybook", label: "Day Book", copy: "Every sale, purchase, receipt and payment in the period." },
  { id: "receivables", label: "Receivables", copy: "Who still owes you — overdue first." },
  { id: "payables", label: "Payables", copy: "What you owe suppliers." },
  { id: "pnl", label: "Profit & Loss", copy: "Income and expenses for the selected dates." },
  { id: "balance", label: "Balance Sheet", copy: "Assets, liabilities and equity snapshot." },
  { id: "trial", label: "Trial Balance", copy: "Check that debits still equal credits." },
  { id: "gst", label: "GST books", copy: "Calculated GST for review — not portal filing." },
  { id: "cashflow", label: "Cash Flow", copy: "Money in and out (simplified)." },
];
export const MORE_LINKS = [
  ["ledger", "Ledger", "One account’s full movement"],
  ["receivables", "Receivables", "Customer outstanding"],
  ["payables", "Payables", "Supplier outstanding"],
  ["bank", "Bank Reconciliation", "Match statement lines"],
  ["trial", "Trial Balance", "Debit vs credit check"],
  ["pnl", "Profit & Loss", "Income and expenses"],
  ["balance", "Balance Sheet", "Assets and liabilities"],
  ["cashbook", "Cashbook", "Operational cash"],
  ["crm", "Customer Pipeline", "Follow up customer opportunities"],
  ["gst", "GST", "Books preparation only"],
  ["setup", "Setup", "Company, GST, locks, backup"],
];
