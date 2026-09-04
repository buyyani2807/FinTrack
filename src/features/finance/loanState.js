import { monthlyInterestOnBalance, monthlyRateOnDate } from "./calculations.js";
import { paymentValue } from "../receipts/receiptModel.js";

const indiaCalendarDate = date => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export const today = () => indiaCalendarDate(new Date());

export const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const addMonths = (s, n) => {
  const d = new Date(`${s}T12:00:00`);
  let day = d.getDate();
  d.setMonth(d.getMonth() + n, 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};

export const elapsedDays = (s, e = today()) => Math.max(0, Math.floor((new Date(`${e}T12:00:00`) - new Date(`${s}T12:00:00`)) / 86400000));

export const dailyProgress = loan => {
  const completed = Math.min(100, elapsedDays(loan.startDate) + 1);
  return { completed, remaining: Math.max(0, 100 - completed) };
};

export const collectedOn = (loan, date = today()) => loan.transactions.some(transaction => transaction.date === date && paymentValue(loan, transaction) > 0);

export const accountOutcome = loan => {
  const status = loanStatus(loan);
  if (!["completed", "closed", "bankrupt"].includes(status)) return null;
  const completionPayment = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const date = status === "completed" ? completionPayment?.date : loan.statusChangedAt ? new Date(loan.statusChangedAt).toLocaleDateString("en-CA") : "";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return { label, date, days: date ? elapsedDays(loan.startDate, date) + 1 : null };
};

export const annualRate = (loan, date) => monthlyRateOnDate(loan, date);

const txTotal = (loan, key) => loan.transactions.reduce((s, t) => s + Number(t[key] || 0), 0);

export const dailyPaid = loan => txTotal(loan, "amount");

export const dailyBalance = loan => Math.max(0, loan.collectionAmount - dailyPaid(loan));

export const monthlyPrincipalPaid = (loan, before) => loan.transactions.filter(t => !before || t.date < before).reduce((s, t) => s + Number(t.principalAmount || 0), 0);

export const monthlyBalance = (loan, before) => Math.max(0, loan.principal - monthlyPrincipalPaid(loan, before));

export const monthlyInterestPaid = loan => txTotal(loan, "interestAmount");

export const monthlyPenaltyPaid = loan => txTotal(loan, "penaltyAmount");

export const monthlyDueRows = loan => {
  const rows = [];
  for (let n = 1;; n++) {
    const dueDate = addMonths(loan.startDate, n);
    if (dueDate > today()) break;
    const balance = monthlyBalance(loan, dueDate);
    if (!balance) break;
    rows.push({
      number: n,
      dueDate,
      balance,
      annualRate: annualRate(loan, dueDate),
      interest: monthlyInterestOnBalance(balance, annualRate(loan, dueDate)),
    });
  }
  return rows;
};

export const monthlyInterestDue = loan => monthlyDueRows(loan).reduce((s, r) => s + r.interest, 0);

export const monthlyInterestPending = loan => Math.max(0, monthlyInterestDue(loan) - monthlyInterestPaid(loan));

export const missedMonths = loan => {
  let remaining = monthlyInterestPaid(loan);
  return monthlyDueRows(loan).filter(r => {
    remaining -= r.interest;
    return remaining < 0;
  }).length;
};

export const estimatedPenalty = loan => Math.round(monthlyInterestPending(loan) * Number(loan.penaltyRate || 0) / 100);

export const loanBalance = loan => loan.status === "bankrupt" ? 0 : loan.kind === "daily" ? dailyBalance(loan) : monthlyBalance(loan);

export const loanPaid = loan => loan.kind === "daily" ? dailyPaid(loan) : txTotal(loan, "principalAmount") + monthlyInterestPaid(loan) + monthlyPenaltyPaid(loan);

export const loanStatus = loan => loan.status === "bankrupt" || loan.status === "closed" ? loan.status : loanBalance(loan) <= 0 ? "completed" : loan.kind === "daily" ? elapsedDays(loan.startDate) >= 100 ? "overdue" : "active" : monthlyInterestPending(loan) > 0 ? "overdue" : "active";
