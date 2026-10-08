const SCENES = {
  dashboard: {
    label: "Sample dashboard",
    title: "Dashboard",
    nav: ["Dashboard", "Daily", "Monthly", "Accounts"],
    active: "Dashboard",
    metrics: [
      { label: "Collected today", value: "18 / 24", note: "Sample customers" },
      { label: "Still due", value: "6", note: "Sample list" },
    ],
    rowsTitle: "Today’s list",
    rows: [
      ["Sample customer A", "Received"],
      ["Sample customer B", "Due"],
      ["Sample route", "6 stops"],
    ],
  },
  finance: {
    label: "Sample daily finance",
    title: "Daily Finance",
    nav: ["Today", "Customers", "Receipts", "Staff"],
    active: "Today",
    metrics: [
      { label: "Due today", value: "24", note: "Sample accounts" },
      { label: "Received", value: "18", note: "Marked on this list" },
    ],
    rowsTitle: "Collections",
    rows: [
      ["Sample customer A", "₹500"],
      ["Sample customer B", "Due"],
      ["Receipt", "Ready to download"],
    ],
  },
  monthly: {
    label: "Sample monthly finance",
    title: "Monthly Finance",
    nav: ["Accounts", "Dues", "History"],
    active: "Dues",
    metrics: [
      { label: "Interest due", value: "Sample", note: "Separate from principal" },
      { label: "Collected", value: "Sample", note: "This month" },
    ],
    rowsTitle: "This account",
    rows: [
      ["Interest", "Recorded apart"],
      ["Principal", "Recorded apart"],
      ["Penalty", "Only if you enter it"],
    ],
  },
  chit: {
    label: "Sample chit fund",
    title: "Chit Fund",
    nav: ["Schemes", "Members", "Live bid", "Dividends"],
    active: "Live bid",
    metrics: [
      { label: "This month", value: "Open", note: "Sample scheme" },
      { label: "Leading discount", value: "₹7,000", note: "Sample bid" },
    ],
    rowsTitle: "Sample bids",
    rows: [
      ["Ticket 2", "₹7,000"],
      ["Ticket 1", "₹5,500"],
      ["Close", "Waits for you"],
    ],
  },
  accounts: {
    label: "Sample accounts",
    title: "Accounts",
    nav: ["Overview", "Vouchers", "Bank", "Reports"],
    active: "Overview",
    metrics: [
      { label: "Receivable", value: "Sample", note: "Open company" },
      { label: "Payable", value: "Sample", note: "Open company" },
    ],
    rowsTitle: "Books to review",
    rows: [
      ["Trial balance", "Balanced"],
      ["Bank line", "Waiting to match"],
      ["GST summary", "Prepare, not file"],
    ],
  },
  intelligence: {
    label: "Sample Ask FinTrack",
    title: "Ask FinTrack",
    nav: ["Ask", "Bills", "Bank", "Attention"],
    active: "Ask",
    metrics: [
      { label: "Ask the books", value: "Answer", note: "This workspace only" },
      { label: "Bill photo", value: "Draft", note: "Not posted yet" },
    ],
    rowsTitle: "Waiting for you",
    rows: [
      ["Expense ledger", "Suggested"],
      ["Bank line", "Match to accept"],
      ["Unusual collection day", "Named, not changed"],
    ],
  },
  portals: {
    label: "Sample preview",
    title: "Sign-in views",
    nav: ["Financier", "Agent", "Customer", "Member"],
    active: "Financier",
    metrics: [
      { label: "Financier", value: "Owner", note: "Full workspace" },
      { label: "Agent", value: "Assigned", note: "Accounts and routes" },
    ],
    rowsTitle: "What each login opens",
    rows: [
      ["Financier", "Owner workspace"],
      ["Collection agent", "Assigned work"],
      ["Finance customer", "Own account"],
      ["Chit member", "Own ticket"],
    ],
  },
};

export function sceneForFeature(feature) {
  if (!feature) return "dashboard";
  if (feature.slug === "monthly-finance") return "monthly";
  if (feature.category === "chit") return "chit";
  if (feature.category === "accounts") return "accounts";
  if (feature.category === "intelligence") return "intelligence";
  if (feature.category === "portals") return "portals";
  return "finance";
}

export function ProductPreview({ scene = "dashboard" }) {
  const view = SCENES[scene] || SCENES.dashboard;
  return <aside className="mkt-app" aria-label={`${view.label}. Sample data, not your books.`}>
    <div className="mkt-app-chrome">
      <span className="mkt-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="mkt-sample">Sample preview</span>
      <span className="mkt-app-title">{view.title}</span>
    </div>
    <div className="mkt-app-body">
      <nav className="mkt-app-side" aria-label="Sample menu">
        {view.nav.map(item => <span key={item} className={item === view.active ? "is-on" : ""}>{item}</span>)}
      </nav>
      <div className="mkt-app-main">
        <div className="mkt-app-metrics">
          {view.metrics.map(item => <div key={item.label} className="mkt-panel">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>)}
        </div>
        <div className="mkt-panel mkt-app-list">
          <span>{view.rowsTitle}</span>
          {view.rows.map(([name, value]) => <div key={name} className="mkt-row"><span>{name}</span><b>{value}</b></div>)}
        </div>
      </div>
    </div>
  </aside>;
}
