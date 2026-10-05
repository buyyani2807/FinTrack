import { roundMoney } from "./accountingModel.js";
import { formatInr } from "../../../lib/formatMoney.js";
import { dashboardMetrics, gstBooksReport, invoiceRegister, profitAndLoss } from "./accountingReports.js";
import { currentStockForItem, itemPurchasesReport, itemSalesReport, stockStatus } from "./inventoryModel.js";

const money = formatInr;

export const ASK_PROMPTS = [
  { id: "receivables", label: "Who owes me?", question: "Who owes me?" },
  { id: "overdue", label: "What is overdue?", question: "What is overdue?" },
  { id: "payables", label: "What do I owe?", question: "What do I owe?" },
  { id: "cash", label: "Cash, bank and UPI", question: "Cash, bank and UPI" },
  { id: "profit", label: "Profit this period", question: "Profit this period" },
  { id: "rent", label: "Rent this period", question: "Rent this period" },
];

const norm = value => String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const MONTHS = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep", "sept"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
];

const rangeLabel = range => `${range.from || "start"} to ${range.to || "today"}`;

function monthBounds(year, monthIndex) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(last).padStart(2, "0")}`,
  };
}

function monthInQuestion(question, range, today) {
  const q = norm(question);
  let monthIndex = -1;
  let monthName = "";
  for (let index = 0; index < MONTHS.length; index += 1) {
    if (!MONTHS[index].some(name => new RegExp(`\\b${name}\\b`).test(q))) continue;
    monthIndex = index;
    monthName = MONTHS[index][0];
    break;
  }
  if (monthIndex < 0) return null;
  const yearMatch = q.match(/\b(20\d{2})\b/);
  let year = yearMatch ? Number(yearMatch[1]) : 0;
  if (!year && range?.from && range?.to) {
    const startYear = Number(String(range.from).slice(0, 4));
    const endYear = Number(String(range.to).slice(0, 4));
    for (let candidate = startYear; candidate <= endYear; candidate += 1) {
      const bounds = monthBounds(candidate, monthIndex);
      if (bounds.from <= range.to && bounds.to >= range.from) {
        year = candidate;
        break;
      }
    }
  }
  if (!year) year = Number(String(today || "").slice(0, 4)) || new Date().getFullYear();
  const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
  return { range: monthBounds(year, monthIndex), label };
}

const takeLines = (rows, limit = 8) => {
  const shown = rows.slice(0, limit);
  const extra = rows.length - shown.length;
  return { shown, extra };
};

function matchParty(question, parties = []) {
  let best = null;
  for (const party of parties) {
    const name = norm(party?.name);
    if (name.length < 3) continue;
    if (!question.includes(name)) continue;
    if (!best || name.length > norm(best.name).length) best = party;
  }
  return best;
}

function matchExpense(question, accounts = []) {
  let best = null;
  for (const account of accounts) {
    if (account.groupType !== "expense" && account.accountType !== "expense") continue;
    const name = norm(account.name);
    if (name.length < 3) continue;
    const words = name.split(" ");
    const hit = question.includes(name) || (words.length === 1 && new RegExp(`\\b${words[0]}\\b`).test(question));
    if (!hit) continue;
    if (!best || name.length > norm(best.name).length) best = account;
  }
  return best;
}

export function classifyAccountsQuestion(question, { parties = [], accounts = [] } = {}) {
  const q = norm(question);
  if (!q) return { id: "empty" };
  const party = matchParty(q, parties);
  if (party && /\b(sold|sell|sale|sales|bought|buy|purchase|purchased)\b/.test(q)) return { id: "partyBills", party };
  if (/\bgst\b|gstr|input tax|output tax/.test(q)) return { id: "gst" };
  const expense = matchExpense(q, accounts);
  if (expense && !/\b(who|owe|owes|owing|receivable|payable)\b/.test(q)) return { id: "expense", expense };
  if (/\boverdue\b|\bpast due\b/.test(q)) {
    if (/\b(pay|supplier|payable)\b/.test(q)) return { id: "payablesOverdue" };
    if (/\b(receiv|customer)\b/.test(q) || /\bowe me\b/.test(q)) return { id: "receivablesOverdue" };
    return { id: "overdue" };
  }
  if (/\b(what do i owe|i owe|payable|supplier)\b/.test(q)) return { id: "payables" };
  if (/\b(who owes|owe me|owes me|receivable|outstanding)\b/.test(q)) return { id: "receivables" };
  if (/\b(cashbook|cash book|cash|bank|upi)\b/.test(q)) return { id: "cash", cashbook: /\b(cashbook|cash book)\b/.test(q) };
  if (/\b(what did i sell|what sold|top selling|best selling|top item|sales this period)\b/.test(q)) return { id: "topItem" };
  if (/\b(what did i buy|what did i purchase|purchases this period)\b/.test(q)) return { id: "purchases" };
  if (/\b(low stock|reorder)\b/.test(q)) return { id: "lowStock" };
  if (/\bexpenses?\b/.test(q) && !/\b(profit|loss|income|revenue)\b/.test(q)) return { id: "expenses" };
  if (/\b(profit|loss|income|revenue|expenses?)\b/.test(q)) return { id: "profit" };
  if (party) return { id: "partyBalance", party };
  return { id: "unknown" };
}

const partyOutstanding = (rows = []) => {
  const map = new Map();
  for (const row of rows) {
    const amount = Number(row.outstanding || 0);
    if (amount <= 0) continue;
    const key = row.partyId || row.partyName || "unassigned";
    if (!map.has(key)) map.set(key, { label: row.partyName || "Unassigned", amount: 0, bills: 0 });
    const item = map.get(key);
    item.amount = roundMoney(item.amount + amount);
    item.bills += 1;
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
};

const openInvoices = (accounts, vouchers, parties, { kind, today, range, outstandingOnly = true }) =>
  invoiceRegister(accounts, vouchers, parties, {
    kind,
    today,
    from: range.from,
    to: range.to,
    outstandingOnly,
  });

function duesAnswer({ title, sourceName, link, rows, empty, noun }) {
  const totals = partyOutstanding(rows);
  const total = roundMoney(totals.reduce((sum, row) => sum + row.amount, 0));
  const { shown, extra } = takeLines(totals);
  return {
    matched: true,
    title,
    summary: total > 0
      ? `${noun} ${money(total)}${extra ? `. Showing ${shown.length} of ${totals.length}` : ""}.`
      : empty,
    source: sourceName,
    link: total > 0 ? link : link,
    lines: shown.map(row => ({
      label: row.label,
      detail: `${row.bills} bill${row.bills === 1 ? "" : "s"}`,
      amount: row.amount,
    })),
  };
}

function booksSnapshot(input) {
  const selected = input.range || {};
  const today = input.today;
  const mentioned = monthInQuestion(input.question, selected, today);
  const range = mentioned?.range || selected;
  const metrics = dashboardMetrics(input.accounts, input.vouchers, input.parties, { today, ...range });
  const pnl = profitAndLoss(input.accounts, input.vouchers, range);
  return { range, today, metrics, pnl, label: mentioned?.label || rangeLabel(range) };
}

function expenseAnswer(expense, pnl, label) {
  const row = (pnl.expenses || []).find(item => item.code === expense.code || item.id === expense.id || item.name === expense.name);
  const amount = roundMoney(row?.amount || 0);
  return {
    matched: true,
    title: expense.name,
    summary: `${expense.name} is ${money(amount)} for ${label}.`,
    source: `Profit and loss · ${expense.code || ""} ${expense.name} · ${label}`.replace(/\s+/g, " ").trim(),
    link: "pnl",
    lines: [{ label: expense.name, detail: expense.code || "", amount }],
  };
}

function cashAnswer(metrics, label, cashbook) {
  const total = roundMoney(Number(metrics.cash || 0) + Number(metrics.bank || 0) + Number(metrics.upi || 0));
  return {
    matched: true,
    title: "Cash, bank and UPI",
    summary: cashbook
      ? `Cash is ${money(metrics.cash)}, bank is ${money(metrics.bank)} and UPI is ${money(metrics.upi)}. The Finance cashbook is its own list.`
      : `Cash is ${money(metrics.cash)}, bank is ${money(metrics.bank)} and UPI is ${money(metrics.upi)}.`,
    source: `Cash, bank and UPI ledgers · ${label}`,
    link: cashbook ? "cashbook" : "ledger",
    lines: [
      { label: "Cash", detail: "", amount: metrics.cash },
      { label: "Bank", detail: "", amount: metrics.bank },
      { label: "UPI", detail: "", amount: metrics.upi },
      { label: "Total", detail: "", amount: total },
    ],
  };
}

function itemNames(voucherItemLines, voucherId) {
  return (voucherItemLines || [])
    .filter(line => line.voucherId === voucherId && line.itemName)
    .map(line => line.itemName);
}

function partyBillsAnswer(party, input, label) {
  const buying = /\b(bought|buy|purchase|purchased)\b/.test(norm(input.question));
  const kind = buying || party.partyType === "supplier" ? "payable" : "receivable";
  const rows = openInvoices(input.accounts, input.vouchers, input.parties, {
    kind,
    today: input.today,
    range: input.range,
    outstandingOnly: false,
  }).filter(row => row.partyId === party.id);
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const { shown, extra } = takeLines(rows);
  const verb = kind === "payable" ? "Purchases from" : "Sales to";
  return {
    matched: true,
    title: party.name,
    summary: rows.length
      ? `${verb} ${party.name} in this period are ${money(total)}${extra ? `. Showing ${shown.length} of ${rows.length}` : ""}.`
      : `${verb} ${party.name} have no bills in this period.`,
    source: `${kind === "payable" ? "Payables" : "Receivables"} register · ${label}`,
    link: kind === "payable" ? "payables" : "receivables",
    lines: shown.map(row => {
      const names = itemNames(input.voucherItemLines, row.voucherId);
      return {
        label: row.reference || "Bill",
        detail: [row.invoiceDate, names.join(", ")].filter(Boolean).join(" · "),
        amount: row.amount,
      };
    }),
  };
}

function partyBalanceAnswer(party, input, label) {
  const kind = party.partyType === "supplier" ? "payable" : "receivable";
  const rows = openInvoices(input.accounts, input.vouchers, input.parties, {
    kind,
    today: input.today,
    range: input.range,
  }).filter(row => row.partyId === party.id);
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.outstanding || 0), 0));
  const { shown } = takeLines(rows.filter(row => Number(row.outstanding) > 0));
  const summary = kind === "payable"
    ? (total > 0 ? `You owe ${party.name} ${money(total)}.` : `You have nothing outstanding to ${party.name} in this period.`)
    : (total > 0 ? `${party.name} owes ${money(total)}.` : `${party.name} has nothing outstanding in this period.`);
  return {
    matched: true,
    title: party.name,
    summary,
    source: `${kind === "payable" ? "Payables" : "Receivables"} register · ${label}`,
    link: kind === "payable" ? "payables" : "receivables",
    lines: shown.map(row => ({
      label: row.reference || "Bill",
      detail: row.invoiceDate || "",
      amount: row.outstanding,
    })),
  };
}

const unknownAnswer = () => ({
  matched: false,
  title: "Ask a question these books can answer",
  summary: "Try who owes you, what is overdue, what you owe, cash, profit, rent, salary, electricity, GST, or a party name.",
  source: "",
  link: null,
  lines: [],
});

export function askAccountsBooks(question, input = {}) {
  const books = booksSnapshot({ ...input, question });
  const intent = classifyAccountsQuestion(question, input);
  const asked = { ...input, question };
  if (intent.id === "empty" || intent.id === "unknown") return unknownAnswer();
  if (intent.id === "receivables" || intent.id === "receivablesOverdue") {
    const rows = openInvoices(input.accounts, input.vouchers, input.parties, { kind: "receivable", today: books.today, range: books.range });
    const filtered = intent.id === "receivablesOverdue" ? rows.filter(row => Number(row.daysOverdue) > 0) : rows;
    return duesAnswer({
      title: intent.id === "receivablesOverdue" ? "Overdue receivables" : "Who owes you",
      sourceName: `Receivables register · ${books.label}`,
      link: "receivables",
      rows: filtered,
      empty: intent.id === "receivablesOverdue"
        ? "No receivable is overdue in this period."
        : "No customer has an outstanding bill in this period.",
      noun: intent.id === "receivablesOverdue" ? "Overdue receivables are" : "Customers owe",
    });
  }
  if (intent.id === "payables" || intent.id === "payablesOverdue") {
    const rows = openInvoices(input.accounts, input.vouchers, input.parties, { kind: "payable", today: books.today, range: books.range });
    const filtered = intent.id === "payablesOverdue" ? rows.filter(row => Number(row.daysOverdue) > 0) : rows;
    return duesAnswer({
      title: intent.id === "payablesOverdue" ? "Overdue payables" : "What you owe",
      sourceName: `Payables register · ${books.label}`,
      link: "payables",
      rows: filtered,
      empty: intent.id === "payablesOverdue"
        ? "No payable is overdue in this period."
        : "No supplier bill is outstanding in this period.",
      noun: intent.id === "payablesOverdue" ? "Overdue payables are" : "You owe",
    });
  }
  if (intent.id === "overdue") {
    const ar = openInvoices(input.accounts, input.vouchers, input.parties, { kind: "receivable", today: books.today, range: books.range })
      .filter(row => Number(row.daysOverdue) > 0);
    const ap = openInvoices(input.accounts, input.vouchers, input.parties, { kind: "payable", today: books.today, range: books.range })
      .filter(row => Number(row.daysOverdue) > 0);
    const arTotal = roundMoney(ar.reduce((sum, row) => sum + Number(row.outstanding || 0), 0));
    const apTotal = roundMoney(ap.reduce((sum, row) => sum + Number(row.outstanding || 0), 0));
    const lines = [
      ...partyOutstanding(ar).slice(0, 4).map(row => ({ label: row.label, detail: "Receivable", amount: row.amount })),
      ...partyOutstanding(ap).slice(0, 4).map(row => ({ label: row.label, detail: "Payable", amount: row.amount })),
    ];
    return {
      matched: true,
      title: "Overdue",
      summary: `Overdue receivables are ${money(arTotal)} and overdue payables are ${money(apTotal)}.`,
      source: `Receivables and payables registers · ${books.label}`,
      link: arTotal >= apTotal ? "receivables" : "payables",
      lines,
    };
  }
  if (intent.id === "expense") return expenseAnswer(intent.expense, books.pnl, books.label);
  if (intent.id === "cash") return cashAnswer(books.metrics, books.label, intent.cashbook);
  if (intent.id === "expenses") {
    const rows = [...(books.pnl.expenses || [])].filter(row => row.amount > 0).sort((a, b) => b.amount - a.amount);
    const { shown, extra } = takeLines(rows);
    return {
      matched: true,
      title: "Expenses",
      summary: `Expenses are ${money(books.pnl.totalExpense)} for ${books.label}${extra ? `. Showing ${shown.length} of ${rows.length}` : ""}.`,
      source: `Profit and loss · ${books.label}`,
      link: "pnl",
      lines: shown.map(row => ({ label: row.name, detail: row.code || "", amount: row.amount })),
    };
  }
  if (intent.id === "profit") {
    return {
      matched: true,
      title: "Profit this period",
      summary: `Income is ${money(books.pnl.totalIncome)}, expenses are ${money(books.pnl.totalExpense)} and net profit is ${money(books.pnl.net)}.`,
      source: `Profit and loss · ${books.label}`,
      link: "pnl",
      lines: [
        { label: "Income", detail: "", amount: books.pnl.totalIncome },
        { label: "Expenses", detail: "", amount: books.pnl.totalExpense },
        { label: "Net profit", detail: "", amount: books.pnl.net },
      ],
    };
  }
  if (intent.id === "gst") {
    const gst = gstBooksReport(input.vouchers, books.range);
    return {
      matched: true,
      title: "GST this period",
      summary: `Output GST is ${money(gst.outputTax)}, input GST is ${money(gst.inputTax)} and net GST is ${money(gst.netPayable)}.`,
      source: `GST books · ${books.label}`,
      link: "gst",
      lines: [
        { label: "Output GST", detail: "", amount: gst.outputTax },
        { label: "Input GST", detail: "", amount: gst.inputTax },
        { label: "Net GST", detail: "", amount: gst.netPayable },
      ],
    };
  }
  if (intent.id === "topItem" || intent.id === "purchases") {
    const rows = intent.id === "purchases"
      ? itemPurchasesReport(input.voucherItemLines, input.vouchers, books.range)
      : itemSalesReport(input.voucherItemLines, input.vouchers, books.range);
    const { shown, extra } = takeLines(rows.filter(row => row.amount || row.quantity));
    const title = intent.id === "purchases" ? "Purchases this period" : "What you sold";
    return {
      matched: true,
      title,
      summary: shown.length
        ? `${shown[0].name} is ${money(shown[0].amount)}${extra ? `. Showing ${shown.length} of ${rows.length}` : ""}.`
        : "No item lines were posted on bills in this period.",
      source: `${intent.id === "purchases" ? "Item purchases" : "Item sales"} · ${books.label}`,
      link: "inventory",
      lines: shown.map(row => ({
        label: row.name || "Item",
        detail: row.quantity ? `${row.quantity}` : "",
        amount: row.amount,
      })),
    };
  }
  if (intent.id === "lowStock") {
    const rows = (input.items || [])
      .filter(item => item.itemType === "product" && item.isActive !== false)
      .map(item => ({
        name: item.name,
        stock: currentStockForItem(item, input.stockMovements),
        reorderLevel: item.reorderLevel,
        unit: item.unit,
      }))
      .filter(row => stockStatus(row.stock, row.reorderLevel) === "low");
    const { shown, extra } = takeLines(rows);
    return {
      matched: true,
      title: "Low stock",
      summary: shown.length
        ? `${rows.length} product${rows.length === 1 ? " is" : "s are"} below reorder level${extra ? `. Showing ${shown.length}` : ""}.`
        : "No product is below its reorder level.",
      source: "Stock on hand",
      link: "inventory",
      lines: shown.map(row => ({
        label: row.name,
        detail: `${row.stock ?? 0}${row.unit ? ` ${row.unit}` : ""} · reorder ${row.reorderLevel}`,
        amount: null,
      })),
    };
  }
  if (intent.id === "partyBills") return partyBillsAnswer(intent.party, asked, books.label);
  if (intent.id === "partyBalance") return partyBalanceAnswer(intent.party, asked, books.label);
  return unknownAnswer();
}
