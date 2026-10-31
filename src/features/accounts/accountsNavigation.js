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
  { id: "expenses", label: "Expenses", glyph: "◔" },
  {
    id: "payroll",
    label: "Payroll",
    glyph: "◈",
    children: [
      { id: "payroll", label: "Pay" },
      { id: "attendance", label: "Attendance" },
      { id: "leave", label: "Leave" },
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
      { id: "crm", label: "Customer Pipeline" },
    ],
  },
  { id: "bank", label: "Banking", glyph: "⬡" },
  { id: "cashbook", label: "Cashbook", glyph: "◇" },
  { id: "setup", label: "Setup", glyph: "⚙" },
];
const SECTION_PARENT = { party: "parties", attendance: "payroll", leave: "payroll" };
export const navItemIsActive = (item, section) => item.children?.some(child => child.id === section) || item.id === section || item.id === SECTION_PARENT[section];
export function sectionTrail(section, reportTab) {
  if (section === "overview") return ["Overview"];
  if (section === "vouchers") return ["Transactions"];
  if (section === "inventory") return ["Inventory"];
  if (section === "documents") return ["Documents"];
  if (section === "expenses") return ["Expenses"];
  if (section === "payroll") return ["Payroll", "Pay"];
  if (section === "attendance") return ["Payroll", "Attendance"];
  if (section === "leave") return ["Payroll", "Leave"];
  if (section === "parties") return ["Parties", "Party Ledger"];
  if (section === "party") return ["Parties", "Party profile"];
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
  if (section === "ca") return ["For the CA"];
  if (section === "crm") return ["Reports", "Customer Pipeline"];
  if (section === "manufacturing") return ["Manufacturing"];
  if (section === "counter") return ["Counter"];
  return [SECTIONS.find(item => item.id === section)?.label || "Accounts"];
}
export const SECTIONS = [
  { id: "overview", label: "Overview", group: "Books" },
  { id: "counter", label: "Counter", group: "Books" },
  { id: "manufacturing", label: "Manufacturing", group: "Industry" },
  { id: "ledger", label: "Ledger", group: "Books" },
  { id: "vouchers", label: "Transactions", group: "Books" },
  { id: "documents", label: "Documents", group: "Books" },
  { id: "inventory", label: "Inventory", group: "Books" },
  { id: "expenses", label: "Expenses", group: "Books" },
  { id: "payroll", label: "Pay", group: "Books" },
  { id: "attendance", label: "Attendance", group: "Books" },
  { id: "leave", label: "Leave", group: "Books" },
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
  { id: "ca", label: "For the CA", group: "Reports" },
  { id: "ai", label: "AI Review", group: "Reports" },
  { id: "setup", label: "Setup", group: "Company" },
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
  { id: "item_profit", label: "Item profit" },
  { id: "stock_moves", label: "Stock Movement" },
  { id: "purchase_match", label: "PO match" },
  { id: "crm", label: "Customer Pipeline" },
];
export const MOBILE_TABS = [
  { id: "overview", label: "Home" },
  { id: "vouchers", label: "Books" },
  { id: "parties", label: "Parties" },
  { id: "reports", label: "Reports" },
  { id: "setup", label: "Setup" },
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
  { id: "crm", label: "Customer Pipeline", copy: "Follow up customer opportunities." },
];

// ---- URLs (see app/AppRoutes.jsx) ----
// A view is { section, reportTab, sub }: `sub` is the document type (documents), the inventory tab (inventory), the
// collection-routes tab (routes) or the party id (party profile). Trial Balance, P&L and Balance Sheet are their own
// sections but live under Reports.
const SECTION_SLUGS = { vouchers: "transactions", bank: "banking", crm: "pipeline", ai: "ai-review", ca: "for-the-ca" };
const PARTY_SLUGS = { parties: "ledger", receivables: "receivables", payables: "payables", routes: "routes", party: "profile" };
const PARTY_SUB_SECTIONS = ["routes", "party"];
const STATEMENTS = ["trial", "pnl", "balance"];
const fromSlug = (map, slug) => Object.keys(map).find(key => map[key] === slug);

export function accountsPath({ section = "overview", reportTab = "daybook", sub = null } = {}) {
  if (section === "party" && !sub) return "/accounting/parties/ledger";
  if (PARTY_SLUGS[section]) return `/accounting/parties/${PARTY_SLUGS[section]}${PARTY_SUB_SECTIONS.includes(section) && sub ? `/${encodeURIComponent(sub)}` : ""}`;
  if (section === "crm" || (section === "reports" && reportTab === "crm")) return "/accounting/reports/crm";
  if (section === "reports" || section === "gst" || STATEMENTS.includes(section)) {
    const report = STATEMENTS.includes(section) || section === "gst" ? section : reportTab || "daybook";
    return `/accounting/reports/${report}`;
  }
  if ((section === "documents" || section === "inventory") && sub) return `/accounting/${section}/${sub}`;
  return `/accounting/${SECTION_SLUGS[section] || section}`;
}

// The view for /accounting/:area/:sub/:subsub (each part optional). Unknown parts fall back to the area's default.
export function accountsViewFromPath(area, sub, subsub) {
  if (area === "parties") {
    const section = fromSlug(PARTY_SLUGS, sub) || "parties";
    if (section === "party" && !subsub) return { section: "parties", reportTab: "daybook", sub: null };
    return { section, reportTab: "daybook", sub: PARTY_SUB_SECTIONS.includes(section) ? subsub || null : null };
  }
  if (area === "reports") {
    const report = REPORT_TABS.some(item => item.id === sub) ? sub : "daybook";
    if (report === "crm") return { section: "crm", reportTab: "crm", sub: null };
    return { section: STATEMENTS.includes(report) ? report : "reports", reportTab: report, sub: null };
  }
  if (area === "more") return { section: "overview", reportTab: "daybook", sub: null };
  const section = fromSlug(SECTION_SLUGS, area) || area;
  const known = SECTIONS.some(item => item.id === section) && !PARTY_SLUGS[section] && section !== "cashbook" && section !== "more";
  if (!known) return { section: "overview", reportTab: "daybook", sub: null };
  return { section, reportTab: section === "crm" ? "crm" : "daybook", sub: section === "documents" || section === "inventory" ? sub || null : null };
}
