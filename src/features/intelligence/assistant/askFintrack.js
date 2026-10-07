import { formatInr } from "../../../lib/formatMoney.js";
import { isModuleEnabled } from "../../commercial/entitlements.js";
import { indianFinancialYear, roundMoney } from "../../accounts/model/accountingModel.js";
import { dashboardMetrics, invoiceRegister, profitAndLoss } from "../../accounts/model/accountingReports.js";
import { aggregateOverview } from "../../cashbook/cashbookModel.js";
import { askAccountsBooks } from "../../accounts/model/accountsAsk.js";
import { suggestExpense } from "../../accounts/model/bookSuggestions.js";
import { buildDailyFinanceFacts, buildMonthlyFinanceFacts } from "../../finance/model/financeIntelligence.js";
import { addDays, loanBalance } from "../../finance/model/loanState.js";
import { paymentValue } from "../../receipts/model/receiptModel.js";

const money = formatInr;

const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9₹\s]/g, " ").replace(/\s+/g, " ").trim();

const ACCOUNTS_LINKS = {
  receivables: { path: "/accounting/reports/receivables", label: "Receivables" },
  payables: { path: "/accounting/reports/payables", label: "Payables" },
  pnl: { path: "/accounting/reports/pnl", label: "Profit and loss" },
  gst: { path: "/accounting/reports/gst", label: "GST report" },
  ledger: { path: "/accounting/ledger", label: "Ledgers" },
  inventory: { path: "/accounting/inventory", label: "Inventory" },
  cashbook: { path: "/cashbook/cashbook", label: "Cashbook" },
  bank: { path: "/accounting/banking", label: "Banking" },
};

export const ASSISTANT_PROMPTS = {
  dashboard: [
    "Who has not paid today?",
    "Which customers are overdue?",
    "Compare this month’s collections with last month.",
  ],
  daily: [
    "Who has not paid today?",
    "Prioritize today’s collection route.",
    "Show outstanding customers above ₹10,000.",
  ],
  monthly: [
    "Which customers are overdue?",
    "Compare this month’s collections with last month.",
    "Which customers missed two installments?",
  ],
  chit: [
    "What is the current auction status?",
    "Which Chit Fund members missed two installments?",
  ],
  accounts: [
    "Why did profit decrease?",
    "Which expenses increased this month?",
    "Show receivables due this week.",
    "Open the GST report.",
  ],
  cashbook: [
    "Why does Cashbook differ from Accounts?",
  ],
};

export function visibleFinanceLoans(loans = [], { isOwner = false, agentId = "", collectionScope = "" } = {}) {
  if (collectionScope === "accounts") return [];
  const list = loans || [];
  if (isOwner) return list;
  const id = String(agentId || "");
  if (!id) return [];
  return list.filter(loan => String(loan.collectionAgentId || "") === id);
}

export function createAskLimiter({ limit = 30, windowMs = 60_000 } = {}) {
  const stamps = [];
  return function allow(now = Date.now()) {
    while (stamps.length && now - stamps[0] >= windowMs) stamps.shift();
    if (stamps.length >= limit) {
      return { ok: false, retryInMs: Math.max(0, windowMs - (now - stamps[0])) };
    }
    stamps.push(now);
    return { ok: true, remaining: limit - stamps.length };
  };
}

function envelope({
  title,
  summary,
  lines = [],
  sourceModule,
  report,
  link = null,
  filters = [],
  warning = null,
  today,
  range,
  matched = true,
  refused = false,
  unavailable = false,
  needs = null,
}) {
  const fy = indianFinancialYear(today || "2026-04-01");
  const from = range?.from || fy.from;
  const to = range?.to || today || fy.to;
  return {
    matched,
    refused,
    unavailable,
    needs,
    title,
    summary,
    period: {
      from,
      to,
      financialYear: fy.label,
      label: range?.label || `${from} to ${to}`,
    },
    source: { module: sourceModule, report },
    filters,
    link,
    lines,
    warning,
    confidence: "verified",
    advisory: true,
  };
}

function rupeeThreshold(question) {
  const q = String(question || "").toLowerCase().replace(/,/g, "");
  const match = q.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(lakh|lac|crore|k)?/);
  if (!match || !/\b(above|over|more than|greater than)\b/.test(q)) return null;
  let amount = Number(match[1]);
  if (match[2] === "lakh" || match[2] === "lac") amount *= 100000;
  if (match[2] === "crore") amount *= 10000000;
  if (match[2] === "k") amount *= 1000;
  return Number.isFinite(amount) ? amount : null;
}

function monthBounds(iso) {
  const [year, month] = String(iso).slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, "0")}`,
    label: `${year}-${mm}`,
  };
}

function previousMonthBounds(iso) {
  return monthBounds(addDays(`${String(iso).slice(0, 7)}-01`, -1));
}

function scopeFilters(context) {
  const filters = [];
  if (context.collectionScope === "accounts") filters.push("Accounts company collections");
  else if (!context.isOwner) filters.push("Customers assigned to you");
  if (context.books?.companyName) filters.push(context.books.companyName);
  return filters;
}

function scopeWarning(context) {
  if (context.collectionScope === "accounts") return "Finance and chit customers are not on an Accounts collection sign-in.";
  if (!context.isOwner) return "Showing customers assigned to you.";
  return null;
}

function agentLabel(id, context) {
  if (id && id === context.agentId && context.agentName) return context.agentName;
  const known = (context.agents || []).find(agent => agent.id === id);
  if (known?.name) return known.name;
  const tail = String(id || "").slice(-4);
  return tail ? `Assigned agent · ${tail}` : "Assigned agent";
}

function peopleLines(rows, detailOf) {
  return rows.slice(0, 8).map(row => ({
    label: row.name || row.customerName || "Customer",
    detail: detailOf(row),
    amount: row.outstanding ?? row.dueToday ?? row.amount ?? null,
  }));
}

function accountsReady(context) {
  return Boolean(context.allowAccounts && context.books?.accounts && context.books?.vouchers);
}

function mapAccountsAnswer(result, context) {
  if (!result?.matched) return null;
  const link = context.allowAccounts ? ACCOUNTS_LINKS[result.link] || null : null;
  return envelope({
    title: result.title,
    summary: result.summary,
    lines: result.lines || [],
    sourceModule: "Accounts",
    report: result.source || "Accounts report",
    link,
    filters: scopeFilters(context),
    warning: result.summary?.includes("no ") ? "No matching posted rows in this period." : null,
    today: context.today,
    range: context.books?.range,
  });
}

function refuse(context, title, summary) {
  return envelope({
    title,
    summary,
    sourceModule: "FinTrack",
    report: "Assistant policy",
    filters: scopeFilters(context),
    warning: "No records were changed.",
    today: context.today,
    matched: false,
    refused: true,
  });
}

function classify(question) {
  const q = norm(question);
  if (!q) return "empty";
  if (/ignore (all |previous )?instructions|system prompt|api key|other compan|all tenants|reveal (the )?(prompt|token|password)/.test(q)) return "injection";
  if (/winning bid|select (a |the )?winner|change (the )?dividend|alter (the )?(installment|commission)/.test(q) && /\b(set|change|update|pick|select|modify|make)\b/.test(q)) return "auctionWrite";
  if (/\b(delete|erase|remove voucher|post this|record this payment|send (the |a )?(whatsapp|message|reminder))\b/.test(q)) return "write";
  if (/forecast|predict|next month.*(collect|expect)|expected profit/.test(q)) return "forecast";
  if (/duplicate (receipt|payment|voucher)|possible duplicate|unusual voucher/.test(q)) return "duplicates";
  if (/cashbook differ|differ from accounts|accounts differ/.test(q)) return "cashbookDiff";
  if (/\b(cashbook|cash book)\b/.test(q)) return "cashbookBalance";
  if (/open the gst|gst report/.test(q)) return "gst";
  if (/why did profit|profit decrease|profit drop/.test(q)) return "profitChange";
  if (/expenses? increased|which expenses/.test(q)) return "expenseChange";
  if (/receivable/.test(q) && /this week|due this week/.test(q)) return "receivablesWeek";
  if (/who has not paid|not paid today|unpaid today/.test(q)) return "unpaidToday";
  if (/prioriti[sz]e|collection route|collection priorit/.test(q)) return "priorities";
  if (/agent/.test(q) && /collect/.test(q)) return "agents";
  if (/compare/.test(q) && /collection/.test(q)) return "compareCollections";
  if (/above|over|more than|greater than/.test(q) && /outstanding/.test(q)) return "outstandingAbove";
  if (/chit/.test(q) && /missed|installment/.test(q)) return "chitMissed";
  if (/auction status|current auction|winning bid/.test(q)) return "auction";
  if (/missed two|missed 2/.test(q)) return "missedTwo";
  if (/overdue/.test(q)) return "overdue";
  if (/remind/.test(q)) return "reminder";
  if (/suggest/.test(q) && /expense|rent|ledger/.test(q)) return "suggestExpense";
  if (/bank line|reconcil|unmatched/.test(q)) return "reconcile";
  if (/customer statement|explain .*statement/.test(q)) return "statement";
  return "unknown";
}

const ACCOUNTS_HINT = /\b(owe|owes|owing|receivable|payable|profit|loss|gst|rent|salary|expense|ledger|stock|sold|purchase|cash|bank|upi|income)\b/;

function unpaidToday(context) {
  const facts = buildDailyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const rows = facts.pendingCustomers || [];
  return envelope({
    title: "Not paid today",
    summary: rows.length
      ? `${rows.length} daily customer${rows.length === 1 ? " has" : "s have"} not paid on ${context.today}. Pending ${money(facts.pendingToday)} of ${money(facts.expectedToday)} expected.`
      : `Every daily customer in view has paid on ${context.today}, or none are due.`,
    lines: peopleLines(rows, row => [row.overdue ? "Overdue" : null, row.missedDays ? `${row.missedDays} recent misses` : null].filter(Boolean).join(" · ")),
    sourceModule: "Daily Finance",
    report: "Today’s collection",
    link: { path: "/daily-finance/todays-collections", label: "Today’s collections" },
    filters: scopeFilters(context),
    warning: scopeWarning(context),
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function overdueCustomers(context) {
  const daily = buildDailyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const monthly = buildMonthlyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const dailyRows = (context.loans || []).filter(loan => loan.kind === "daily" && (daily.pendingCustomers || []).some(row => row.id === loan.id && row.overdue));
  const monthlyRows = (monthly.priorities || []).filter(row => row.missed > 0 || row.outstanding > 0);
  const lines = [
    ...peopleLines(dailyRows.map(loan => ({ name: loan.customerName, outstanding: loanBalance(loan) })), () => "Daily · overdue"),
    ...peopleLines(monthlyRows, row => row.why?.join(" · ") || "Monthly"),
  ].slice(0, 8);
  const count = (daily.overdueCount || 0) + (monthly.overdueCount || 0);
  return envelope({
    title: "Overdue customers",
    summary: count
      ? `${daily.overdueCount || 0} daily and ${monthly.overdueCount || 0} monthly accounts are overdue.`
      : "No overdue daily or monthly account is in view.",
    lines,
    sourceModule: "Finance",
    report: "Daily and monthly collection status",
    link: { path: "/daily-finance/todays-collections", label: "Daily collections" },
    filters: scopeFilters(context),
    warning: scopeWarning(context),
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function outstandingAbove(context, question) {
  const threshold = rupeeThreshold(question);
  if (threshold == null) {
    return envelope({
      title: "Outstanding above an amount",
      summary: "Name an amount, for example outstanding customers above ₹10,000.",
      sourceModule: "Finance",
      report: "Loan balance",
      today: context.today,
      matched: false,
      filters: scopeFilters(context),
    });
  }
  const rows = (context.loans || [])
    .map(loan => ({ name: loan.customerName, outstanding: loanBalance(loan), kind: loan.kind }))
    .filter(row => row.outstanding > threshold)
    .sort((a, b) => b.outstanding - a.outstanding);
  return envelope({
    title: `Outstanding above ${money(threshold)}`,
    summary: rows.length
      ? `${rows.length} customer${rows.length === 1 ? "" : "s"} ${rows.length === 1 ? "has" : "have"} more than ${money(threshold)} outstanding.`
      : `No customer in view has more than ${money(threshold)} outstanding.`,
    lines: peopleLines(rows, row => row.kind === "monthly" ? "Monthly Finance" : "Daily Finance"),
    sourceModule: "Finance",
    report: "Loan balance",
    filters: [...scopeFilters(context), `Above ${money(threshold)}`],
    warning: scopeWarning(context),
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function compareCollections(context) {
  const facts = buildMonthlyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const change = facts.hasPreviousMonth
    ? `${facts.monthChange > 0 ? "up" : facts.monthChange < 0 ? "down" : "unchanged"} ${Math.abs(facts.monthChange)}%`
    : null;
  return envelope({
    title: "Collections compared with last month",
    summary: facts.hasPreviousMonth
      ? `Collected ${money(facts.collectedThisMonth)} in ${facts.currentMonth} and ${money(facts.collectedPreviousMonth)} in ${facts.previousMonth} (${change}).`
      : `Collected ${money(facts.collectedThisMonth)} in ${facts.currentMonth}. Last month has no recorded collections to compare.`,
    lines: [
      { label: facts.currentMonth, detail: "Collected", amount: facts.collectedThisMonth },
      { label: facts.previousMonth, detail: "Collected", amount: facts.collectedPreviousMonth },
    ],
    sourceModule: "Monthly Finance",
    report: "Collections by month",
    link: { path: "/monthly-finance/todays-collections", label: "Monthly collections" },
    filters: scopeFilters(context),
    warning: facts.hasPreviousMonth ? scopeWarning(context) : "Insufficient history for a percentage change.",
    today: context.today,
    range: { from: `${facts.previousMonth}-01`, to: context.today, label: `${facts.previousMonth} to ${facts.currentMonth}` },
  });
}

function agentPerformance(context) {
  const start = addDays(context.today, -6);
  const totals = new Map();
  for (const loan of context.loans || []) {
    const id = loan.collectionAgentId;
    if (!id) continue;
    for (const transaction of loan.transactions || []) {
      if (!transaction.date || transaction.date < start || transaction.date > context.today) continue;
      const amount = paymentValue(loan, transaction);
      if (!(amount > 0)) continue;
      const row = totals.get(id) || { id, name: agentLabel(id, context), amount: 0 };
      row.amount = roundMoney(row.amount + amount);
      totals.set(id, row);
    }
  }
  const rows = [...totals.values()].sort((a, b) => b.amount - a.amount);
  return envelope({
    title: context.isOwner ? "Collections by agent this week" : "Your collections this week",
    summary: rows.length
      ? `${rows[0].name} collected ${money(rows[0].amount)} from ${start} to ${context.today}.`
      : "No collection on an assigned agent is recorded for this week.",
    lines: rows.slice(0, 8).map(row => ({ label: row.name, detail: "Collected", amount: row.amount })),
    sourceModule: "Finance",
    report: "Recorded collections",
    filters: [...scopeFilters(context), `${start} to ${context.today}`],
    warning: rows.length ? scopeWarning(context) : "Agent names appear only when the staff list is loaded. Amounts still come from recorded payments.",
    today: context.today,
    range: { from: start, to: context.today, label: `${start} to ${context.today}` },
  });
}

function priorities(context) {
  const facts = buildDailyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const rows = facts.priorities || [];
  return envelope({
    title: "Today’s collection priorities",
    summary: rows.length
      ? `${rows.length} customer${rows.length === 1 ? "" : "s"} to visit first. ${rows[0].name} is first.`
      : "No daily collection is pending in view.",
    lines: rows.map(row => ({
      label: row.name,
      detail: (row.why || []).join(" · "),
      amount: row.outstanding,
    })),
    sourceModule: "Daily Finance",
    report: "Collection priority",
    link: { path: "/daily-finance/todays-collections", label: "Today’s collections" },
    filters: scopeFilters(context),
    warning: [scopeWarning(context), "Priority is advisory. It does not change assignments or credit scores."].filter(Boolean).join(" "),
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function reminderDraft(context) {
  const facts = buildDailyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const rows = (facts.priorities || []).slice(0, 5);
  return envelope({
    title: "Reminder drafts",
    summary: rows.length
      ? `${rows.length} draft${rows.length === 1 ? "" : "s"}. Nothing is sent until you confirm in Receipts.`
      : "No pending daily customer to remind.",
    lines: rows.map(row => ({
      label: row.name,
      detail: `Draft: ${row.name}, ${money(row.dueToday)} is due today. Outstanding ${money(row.outstanding)}.`,
      amount: row.dueToday,
    })),
    sourceModule: "Daily Finance",
    report: "Reminder draft",
    link: context.isOwner ? { path: "/settings/whatsapp", label: "WhatsApp settings" } : null,
    filters: scopeFilters(context),
    warning: "Draft only. Ask FinTrack does not send WhatsApp messages or change balances.",
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function auctionStatus(context) {
  if (!context.allowChit) {
    return envelope({
      title: "Auction status",
      summary: "Chit Fund is not available on this sign-in.",
      sourceModule: "Chit Fund",
      report: "Active schemes",
      today: context.today,
      matched: false,
      filters: scopeFilters(context),
    });
  }
  const schemes = context.chitSchemes || [];
  const auction = schemes.filter(scheme => (scheme.chit_type || scheme.chitType || "auction") === "auction");
  return envelope({
    title: "Auction status",
    summary: auction.length
      ? `${auction.length} active auction scheme${auction.length === 1 ? "" : "s"}. Winning bids are stored on each scheme and are not guessed here.`
      : schemes.length
        ? `${schemes.length} active scheme${schemes.length === 1 ? "" : "s"}, and none are marked as auction.`
        : "No active chit scheme is loaded.",
    lines: auction.slice(0, 8).map(scheme => ({
      label: scheme.name || "Scheme",
      detail: scheme.status || "active",
      amount: scheme.chit_value || scheme.chitValue || null,
    })),
    sourceModule: "Chit Fund",
    report: "Active schemes",
    link: context.allowChit ? { path: "/chit-fund/schemes", label: "Chit schemes" } : null,
    filters: scopeFilters(context),
    warning: "Ask does not select a winner or change a bid. Open the scheme for the live auction.",
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function chitMissed(context) {
  return envelope({
    title: "Missed chit installments",
    summary: "Member installment history is not loaded in Ask, so no member is listed.",
    sourceModule: "Chit Fund",
    report: "Installments",
    link: context.allowChit ? { path: "/chit-fund/payments", label: "Chit payments" } : null,
    filters: scopeFilters(context),
    warning: "Insufficient installment history in this panel. Open Chit Fund payments. Names are not guessed.",
    today: context.today,
    matched: true,
  });
}

function missedTwoFinance(context) {
  const facts = buildMonthlyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  const rows = facts.priorities?.filter(row => row.missed >= 2) || [];
  return envelope({
    title: "Missed two monthly installments",
    summary: rows.length
      ? `${rows.length} monthly customer${rows.length === 1 ? " has" : "s have"} missed two or more payments.`
      : "No monthly customer in view has missed two payments.",
    lines: rows.map(row => ({ label: row.name, detail: (row.why || []).join(" · "), amount: row.outstanding })),
    sourceModule: "Monthly Finance",
    report: "Missed months",
    link: { path: "/monthly-finance/customers", label: "Monthly customers" },
    filters: scopeFilters(context),
    warning: scopeWarning(context),
    today: context.today,
    range: { from: context.today, to: context.today, label: context.today },
  });
}

function cashbookBalance(context) {
  if (!context.allowCashbook) {
    return envelope({
      title: "Cashbook",
      summary: "This sign-in cannot open the Finance cashbook.",
      sourceModule: "Cashbook",
      report: "Cashbook balances",
      today: context.today,
      matched: false,
      filters: scopeFilters(context).filter(filter => filter !== context.books?.companyName),
    });
  }
  const loaded = context.cashbook?.ledgers && context.cashbook?.entries;
  if (!loaded) {
    return envelope({
      title: "Loading Cashbook",
      summary: "Ask needs the Finance cashbook for this question.",
      sourceModule: "Cashbook",
      report: "Cashbook balances",
      today: context.today,
      matched: false,
      needs: "cashbook",
    });
  }
  if (context.allowAccounts && context.books == null && !context.accountsLoaded) {
    return envelope({
      title: "Loading Accounts",
      summary: "Ask is reading the Finance cashbook, then the Accounts cash ledger for this company.",
      sourceModule: "Cashbook",
      report: "Cashbook balances",
      today: context.today,
      matched: false,
      needs: "accounts",
    });
  }
  const today = context.today;
  const overview = aggregateOverview(context.cashbook.ledgers, context.cashbook.entries, { from: today, to: today });
  const lines = [
    { label: "Cash", detail: "Running balance", amount: overview.cash },
    { label: "Bank", detail: "Running balance", amount: overview.bank },
    { label: "UPI", detail: "Running balance", amount: overview.upi },
    { label: "Total", detail: "Running balance", amount: overview.total },
    { label: "Today's in", detail: today, amount: overview.moneyIn },
    { label: "Today's out", detail: today, amount: overview.moneyOut },
  ];
  let accountsSentence = "";
  if (context.books?.accounts && context.books?.vouchers) {
    const metrics = dashboardMetrics(context.books.accounts, context.books.vouchers, context.books.parties || [], {
      today,
      from: context.books.range?.from,
      to: context.books.range?.to || today,
    });
    const company = context.books.companyName || "Accounts";
    lines.push({
      label: `${company} cash ledger`,
      detail: "Accounts, separate from the cashbook",
      amount: metrics.cash,
    });
    accountsSentence = ` ${company} cash ledger is ${money(metrics.cash)}. That figure is the Accounts book, not the cashbook.`;
  }
  return envelope({
    title: "Cashbook",
    summary: `Cashbook cash is ${money(overview.cash)}, bank is ${money(overview.bank)} and UPI is ${money(overview.upi)}. These are running balances of every recorded cashbook entry.${accountsSentence}`,
    lines,
    sourceModule: "Cashbook",
    report: "Cashbook balances",
    link: { path: "/cashbook/cashbook", label: "Cashbook" },
    filters: ["Finance cashbook"],
    warning: "Cash, bank, and UPI here are running cashbook balances. They are not today's movement, and they are not the Accounts cash ledger.",
    today,
    range: { from: today, to: today, label: "Running balances" },
  });
}

function cashbookDiff(context) {
  return envelope({
    title: "Cashbook and Accounts",
    summary: "The finance cashbook and the Accounts cash ledgers are separate books. They match only after Sync linked vouchers copies cashbook rows into the primary Accounts company. A sale, receipt, or expense typed only in Accounts stays in Accounts.",
    sourceModule: "Cashbook",
    report: "Accounting integration",
    link: context.allowAccounts ? { path: "/accounting/setup", label: "Accounts setup" } : { path: "/cashbook/cashbook", label: "Cashbook" },
    filters: scopeFilters(context),
    warning: "This answer does not invent the rupee difference. Compare the cashbook total with the Accounts cash, bank, and UPI ledgers.",
    today: context.today,
  });
}

function needsAccounts(context) {
  if (!context.allowAccounts) {
    return envelope({
      title: "Accounts is not available",
      summary: "This sign-in cannot open Accounts books.",
      sourceModule: "Accounts",
      report: "Accounts",
      today: context.today,
      matched: false,
      filters: scopeFilters(context),
    });
  }
  return envelope({
    title: "Loading Accounts",
    summary: "Ask needs the posted Accounts books for this question.",
    sourceModule: "Accounts",
    report: "Accounts",
    today: context.today,
    matched: false,
    needs: "accounts",
    filters: scopeFilters(context),
  });
}

function profitChange(context) {
  if (!accountsReady(context)) return needsAccounts(context);
  const current = monthBounds(context.today);
  const previous = previousMonthBounds(context.today);
  current.to = context.today < current.to ? context.today : current.to;
  const now = profitAndLoss(context.books.accounts, context.books.vouchers, current);
  const then = profitAndLoss(context.books.accounts, context.books.vouchers, previous);
  const delta = roundMoney(now.net - then.net);
  const incomeDelta = roundMoney(now.totalIncome - then.totalIncome);
  const expenseDelta = roundMoney(now.totalExpense - then.totalExpense);
  const reason = delta < 0
    ? `${incomeDelta < 0 ? `Income is ${money(Math.abs(incomeDelta))} lower` : `Income is ${money(incomeDelta)} higher`}. ${expenseDelta > 0 ? `Expenses are ${money(expenseDelta)} higher` : `Expenses are ${money(Math.abs(expenseDelta))} lower`}.`
    : delta > 0
      ? `Net profit is ${money(delta)} higher than last month.`
      : "Net profit is unchanged from last month.";
  return envelope({
    title: "Profit compared with last month",
    summary: `Net profit is ${money(now.net)} so far in ${current.label} and was ${money(then.net)} in ${previous.label}. ${reason}`,
    lines: [
      { label: "This month", detail: "Net profit", amount: now.net },
      { label: "Last month", detail: "Net profit", amount: then.net },
      { label: "Income change", detail: "", amount: incomeDelta },
      { label: "Expense change", detail: "", amount: expenseDelta },
    ],
    sourceModule: "Accounts",
    report: "Profit and loss",
    link: ACCOUNTS_LINKS.pnl,
    filters: [...scopeFilters(context), current.label, previous.label],
    warning: "The change is the difference in posted profit and loss. It is not a cause beyond income and expense totals.",
    today: context.today,
    range: { from: previous.from, to: current.to, label: `${previous.label} to ${current.label}` },
  });
}

function expenseChange(context) {
  if (!accountsReady(context)) return needsAccounts(context);
  const current = monthBounds(context.today);
  const previous = previousMonthBounds(context.today);
  current.to = context.today < current.to ? context.today : current.to;
  const now = profitAndLoss(context.books.accounts, context.books.vouchers, current);
  const then = profitAndLoss(context.books.accounts, context.books.vouchers, previous);
  const previousByCode = new Map((then.expenses || []).map(row => [row.code || row.name, row.amount]));
  const increased = (now.expenses || [])
    .map(row => ({
      name: row.name,
      amount: row.amount,
      delta: roundMoney(row.amount - (previousByCode.get(row.code || row.name) || 0)),
    }))
    .filter(row => row.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  return envelope({
    title: "Expenses that increased",
    summary: increased.length
      ? `${increased.length} expense ledger${increased.length === 1 ? "" : "s"} ${increased.length === 1 ? "is" : "are"} higher than ${previous.label}. ${increased[0].name} is up ${money(increased[0].delta)}.`
      : `No expense ledger is higher in ${current.label} than in ${previous.label}.`,
    lines: increased.slice(0, 8).map(row => ({ label: row.name, detail: "Increase", amount: row.delta })),
    sourceModule: "Accounts",
    report: "Profit and loss",
    link: ACCOUNTS_LINKS.pnl,
    filters: [...scopeFilters(context), current.label, previous.label],
    today: context.today,
    range: { from: previous.from, to: current.to, label: `${previous.label} to ${current.label}` },
  });
}

function receivablesWeek(context) {
  if (!accountsReady(context)) return needsAccounts(context);
  const end = addDays(context.today, 7);
  const rows = invoiceRegister(context.books.accounts, context.books.vouchers, context.books.parties, {
    kind: "receivable",
    today: context.today,
    outstandingOnly: true,
  }).filter(row => row.dueDate && row.dueDate >= context.today && row.dueDate <= end && Number(row.outstanding) > 0);
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.outstanding || 0), 0));
  return envelope({
    title: "Receivables due this week",
    summary: rows.length
      ? `${money(total)} is due from ${context.today} to ${end}.`
      : `No receivable is due between ${context.today} and ${end}.`,
    lines: rows.slice(0, 8).map(row => ({
      label: row.partyName || "Customer",
      detail: `${row.reference || "Bill"} · due ${row.dueDate}`,
      amount: row.outstanding,
    })),
    sourceModule: "Accounts",
    report: "Receivables register",
    link: ACCOUNTS_LINKS.receivables,
    filters: [...scopeFilters(context), `Due ${context.today} to ${end}`],
    today: context.today,
    range: { from: context.today, to: end, label: `${context.today} to ${end}` },
  });
}

function gstAnswer(context, question) {
  const open = envelope({
    title: "GST report",
    summary: "Open the GST report for posted output tax, input tax, and net GST.",
    sourceModule: "Accounts",
    report: "GST books",
    link: context.allowAccounts ? ACCOUNTS_LINKS.gst : null,
    filters: scopeFilters(context),
    today: context.today,
    range: context.books?.range,
  });
  if (!accountsReady(context)) return context.allowAccounts && /\bgst\b/.test(norm(question)) && !context.books ? needsAccounts(context) : open;
  const detailed = askAccountsBooks(question.includes("open") ? "GST this period" : question, {
    ...context.books,
    today: context.today,
    question,
  });
  return mapAccountsAnswer(detailed, context) || open;
}

function forecast(context) {
  const facts = buildMonthlyFinanceFacts(context.loans, { asOf: context.today, isOwner: context.isOwner });
  if (!facts.hasPreviousMonth || !(facts.collectedThisMonth > 0)) {
    return envelope({
      title: "Collection outlook",
      summary: "Insufficient history. At least this month and last month of recorded collections are required before an outlook is shown.",
      sourceModule: "Monthly Finance",
      report: "Collections by month",
      filters: scopeFilters(context),
      warning: "Not a guarantee. No outlook number is shown.",
      today: context.today,
      matched: false,
    });
  }
  const average = roundMoney((facts.collectedThisMonth + facts.collectedPreviousMonth) / 2);
  return envelope({
    title: "Collection outlook, not a guarantee",
    summary: `If next month matches the average of ${facts.currentMonth} (${money(facts.collectedThisMonth)}) and ${facts.previousMonth} (${money(facts.collectedPreviousMonth)}), collections would be about ${money(average)}.`,
    lines: [{ label: "Outlook", detail: "Average of the last two recorded months", amount: average }],
    sourceModule: "Monthly Finance",
    report: "Collections by month",
    filters: scopeFilters(context),
    warning: "Assumption: next month repeats the recent average. New loans, missed payments, and seasonality are not modelled. This is not a promise.",
    today: context.today,
    range: { from: `${facts.previousMonth}-01`, to: context.today, label: `${facts.previousMonth} to ${facts.currentMonth}` },
  });
}

function duplicates(context) {
  if (!accountsReady(context)) return needsAccounts(context);
  const groups = new Map();
  for (const voucher of context.books.vouchers || []) {
    if (voucher.status && voucher.status !== "posted") continue;
    const total = roundMoney((voucher.lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0));
    const key = [voucher.voucherType, voucher.date, voucher.partyId || "", total].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(voucher);
  }
  const rows = [...groups.values()].filter(group => group.length > 1);
  return envelope({
    title: "Possible duplicate vouchers",
    summary: rows.length
      ? `${rows.length} group${rows.length === 1 ? "" : "s"} share a type, date, party, and amount. Requires review.`
      : "No posted vouchers share the same type, date, party, and amount.",
    lines: rows.slice(0, 8).map(group => ({
      label: group.map(voucher => voucher.voucherNumber).filter(Boolean).join(", ") || "Vouchers",
      detail: `${group[0].date || ""} · possible duplicate`,
      amount: roundMoney((group[0].lines || []).reduce((sum, line) => sum + Number(line.debit || 0), 0)),
    })),
    sourceModule: "Accounts",
    report: "Posted vouchers",
    link: { path: "/accounting/transactions", label: "Transactions" },
    filters: scopeFilters(context),
    warning: "Possible duplicate means the posted fields match. It is not a finding of fraud.",
    today: context.today,
    range: context.books.range,
  });
}

function suggestExpenseAnswer(context, question) {
  if (!accountsReady(context)) return needsAccounts(context);
  const suggestion = suggestExpense(question, context.books.vouchers, context.books.accounts);
  if (!suggestion) {
    return envelope({
      title: "No expense suggestion",
      summary: "No posted expense ledger matches that note. Nothing was filled in.",
      sourceModule: "Accounts",
      report: "Posted expenses",
      filters: scopeFilters(context),
      warning: "No ledger was chosen.",
      today: context.today,
      matched: false,
    });
  }
  return envelope({
    title: `Suggest ${suggestion.expenseName}`,
    summary: `The last posted ${suggestion.expenseName} was ${money(suggestion.amount)} on ${suggestion.date}. Open an expense and apply it. Nothing is posted from Ask.`,
    lines: [{ label: suggestion.expenseName, detail: suggestion.expenseCode, amount: suggestion.amount }],
    sourceModule: "Accounts",
    report: "Posted expenses",
    link: { path: "/accounting/overview", label: "Accounts" },
    filters: scopeFilters(context),
    warning: "Suggestion only. Save the expense yourself.",
    today: context.today,
  });
}

function statementAnswer(context, question) {
  const named = (context.loans || []).find(loan => {
    const name = norm(loan.customerName);
    return name.length >= 3 && norm(question).includes(name);
  });
  if (named) {
    const outstanding = loanBalance(named);
    return envelope({
      title: named.customerName,
      summary: `${named.customerName} has ${money(outstanding)} outstanding on ${named.kind === "monthly" ? "Monthly" : "Daily"} Finance as of ${context.today}.`,
      lines: [{ label: "Outstanding", detail: named.kind || "", amount: outstanding }],
      sourceModule: named.kind === "monthly" ? "Monthly Finance" : "Daily Finance",
      report: "Loan balance",
      filters: scopeFilters(context),
      warning: scopeWarning(context),
      today: context.today,
      range: { from: context.today, to: context.today, label: context.today },
    });
  }
  if (accountsReady(context)) {
    const result = askAccountsBooks(question, { ...context.books, today: context.today, question });
    const mapped = mapAccountsAnswer(result, context);
    if (mapped) return mapped;
  }
  return envelope({
    title: "Customer statement",
    summary: "Name the customer, for example explain Ravi Kumar’s statement.",
    sourceModule: "Finance",
    report: "Loan balance",
    today: context.today,
    matched: false,
    filters: scopeFilters(context),
  });
}

function reconcileAnswer(context) {
  return envelope({
    title: "Bank and books matching",
    summary: "Banking can suggest a books line when the amount and the statement text agree. Accept, ignore, or create an entry yourself. Ask does not match or post anything.",
    sourceModule: "Accounts",
    report: "Bank statement matching",
    link: context.allowAccounts ? ACCOUNTS_LINKS.bank : null,
    filters: scopeFilters(context),
    warning: "Suggestions never change cash, bank, or profit until you save an entry or tap Match.",
    today: context.today,
  });
}

function accountsFallback(context, question) {
  if (!accountsReady(context)) {
    if (context.allowAccounts && context.books == null && ACCOUNTS_HINT.test(norm(question))) return needsAccounts(context);
    return envelope({
      title: "Ask a question these records can answer",
      summary: "Try who has not paid today, overdue customers, this month versus last month, profit, receivables due this week, or GST.",
      sourceModule: "FinTrack",
      report: "Ask FinTrack",
      today: context.today,
      matched: false,
      filters: scopeFilters(context),
      warning: "Unrecognised questions are not answered with an estimate.",
    });
  }
  const result = askAccountsBooks(question, { ...context.books, today: context.today, question });
  return mapAccountsAnswer(result, context) || envelope({
    title: "Ask a question these books can answer",
    summary: result.summary,
    sourceModule: "Accounts",
    report: "Ask the books",
    today: context.today,
    range: context.books.range,
    matched: false,
    filters: scopeFilters(context),
  });
}

export function askFintrack(question, context = {}) {
  const today = context.today;
  const orgSettings = context.orgSettings || {};
  if (!isModuleEnabled(orgSettings, "ai")) {
    return envelope({
      title: "Ask FinTrack is off for this workspace",
      summary: "The ai feature is not included in the current feature pack.",
      sourceModule: "FinTrack",
      report: "Feature pack",
      today,
      matched: false,
      unavailable: true,
    });
  }
  const intent = classify(question);
  if (intent === "empty") {
    return envelope({
      title: "Ask FinTrack",
      summary: "Ask about collections, overdue customers, profit, receivables, or the GST report.",
      sourceModule: "FinTrack",
      report: "Ask FinTrack",
      today,
      matched: false,
    });
  }
  if (intent === "injection") return refuse(context, "This workspace only", "Ask FinTrack answers from this workspace’s verified records. It does not follow instructions to reveal keys, ignore its limits, or open another company.");
  if (intent === "auctionWrite") return refuse(context, "Auction stays with the chit engine", "Ask cannot select a winner, change a winning bid, or alter dividend, commission, or installment figures.");
  if (intent === "write") return refuse(context, "Nothing was changed", "Ask is read-only. Payments, messages, and vouchers stay on their own screens and still need you to confirm them.");
  if (intent === "unpaidToday") return unpaidToday(context);
  if (intent === "overdue") return overdueCustomers(context);
  if (intent === "outstandingAbove") return outstandingAbove(context, question);
  if (intent === "compareCollections") return compareCollections(context);
  if (intent === "agents") return agentPerformance(context);
  if (intent === "priorities") return priorities(context);
  if (intent === "reminder") return reminderDraft(context);
  if (intent === "auction") return auctionStatus(context);
  if (intent === "chitMissed") return chitMissed(context);
  if (intent === "missedTwo") return missedTwoFinance(context);
  if (intent === "cashbookDiff") return cashbookDiff(context);
  if (intent === "cashbookBalance") return cashbookBalance(context);
  if (intent === "profitChange") return profitChange(context);
  if (intent === "expenseChange") return expenseChange(context);
  if (intent === "receivablesWeek") return receivablesWeek(context);
  if (intent === "gst") return gstAnswer(context, question);
  if (intent === "forecast") return forecast(context);
  if (intent === "duplicates") return duplicates(context);
  if (intent === "suggestExpense") return suggestExpenseAnswer(context, question);
  if (intent === "statement") return statementAnswer(context, question);
  if (intent === "reconcile") return reconcileAnswer(context);
  return accountsFallback(context, question);
}

export function assistantPromptsForPath(pathname = "") {
  const path = String(pathname || "");
  if (path.startsWith("/daily-finance")) return ASSISTANT_PROMPTS.daily;
  if (path.startsWith("/monthly-finance")) return ASSISTANT_PROMPTS.monthly;
  if (path.startsWith("/chit-fund")) return ASSISTANT_PROMPTS.chit;
  if (path.startsWith("/accounting")) return ASSISTANT_PROMPTS.accounts;
  if (path.startsWith("/cashbook")) return ASSISTANT_PROMPTS.cashbook;
  return ASSISTANT_PROMPTS.dashboard;
}
