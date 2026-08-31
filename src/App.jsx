import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { supabase } from "./lib/supabase";
import { monthlyInterestOnBalance, dailyInstallmentAmount } from "./features/finance/calculations";
import { formatInr } from "./lib/formatMoney.js";
import { investedAmount, netPosition, realizedLoss, realizedProfit } from "./features/finance/pnl.js";
import { byCollectionOrderThenName, mergeAccountOrder, reorderIds } from "./features/finance/collectionOrder";
import { financeKindLabel, staffAssignableLoans } from "./features/finance/collectionStaff";
import { mergeAccountTransaction } from "./features/finance/paymentState.js";
import { financeRolesAligned, ownerChromeAllowed, sessionUserRole } from "./features/finance/workspaceAccess.js";
import { ChitCustomerPortal, ChitFundPage } from "./features/chitFund/ChitFundModule";
import { LegalPage, legalViewFromLocation, openLegalView } from "./features/legal/LegalPage.jsx";
import { isPublicSignupAllowed, signupInviteRequired, validateSignupInvite } from "./lib/signupGate.js";
import { assignCollectionAgents, chitCustomerPortalLogin, createCollectionAgent, createFinanceAccount, customerPortalLogin, deleteFinanceAccount, deleteFinancePayment, enableCustomerPortal, loadActiveChitSchemes, loadChitSchemeDetails, loadChitSchemes, loadCustomerKyc, loadFinanceAccounts, loadManagedAgents, loadPaymentReminderLog, loadWorkspace, logReceiptActivity, recordPayment, resetCustomerPortalPin, saveCustomerKyc, setAccountStatus, saveCollectionOrder, updateCollectionAgent, updateFinanceAccount, updateFinancePayment, updatePaymentNotes } from "./lib/financeRepository";
import { buildFinanceReceipt } from "./features/receipts/receiptModel.js";
import { ReceiptActions, ReceiptSuccessModal } from "./features/receipts/ReceiptActions.jsx";
import { ReceiptSettingsPage } from "./features/receipts/ReceiptSettingsPage.jsx";
import { UpcomingPaymentsSection, UpcomingPaymentCard } from "./features/receipts/UpcomingPaymentsSection.jsx";
import { buildMonthlyUpcoming } from "./features/receipts/upcomingPayments.js";
import { CustomerStatementPage } from "./features/statements/CustomerStatementPage.jsx";
import { AccountsModule, AccountsSummaryCard } from "./features/accounts/AccountsModule.jsx";
import { CreditScoreCard } from "./features/creditScore/CreditScoreCard.jsx";
import { buildChitMonthStatement, currentSchemeMonth, monthLabel as chitMonthLabel } from "./features/chitFund/monthStatement";
import { downloadChitMonthStatementPdf } from "./features/chitFund/monthStatementPdf";

// FinTrack MVP. This browser-only build is for testing; add a secure backend,
// authentication, audit trails, and local compliance review before production.
const C = {
  bg: "#0e1118",
  surface: "#171c27",
  card: "#202737",
  line: "#303a4d",
  text: "#f4f6fb",
  muted: "#9ba9bd",
  gold: "#f4b942",
  green: "#4fd08d",
  red: "#ff7373",
  blue: "#72aaff"
};
const indiaCalendarDate = date => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const today = () => indiaCalendarDate(new Date());
const generateCustomerPortalPin = () => String(100000 + Math.floor(Math.random() * 900000));
const money = formatInr;
const byCustomerName = (a, b) => String(a.customerName || "").localeCompare(String(b.customerName || ""), undefined, { sensitivity: "base" });
const addDays = (s, n) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (s, n) => {
  const d = new Date(`${s}T12:00:00`),
    day = d.getDate();
  d.setMonth(d.getMonth() + n, 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.toISOString().slice(0, 10);
};
const elapsedDays = (s, e = today()) => Math.max(0, Math.floor((new Date(`${e}T12:00:00`) - new Date(`${s}T12:00:00`)) / 86400000));
const dailyProgress = loan => { const completed = Math.min(100, elapsedDays(loan.startDate) + 1); return { completed, remaining: Math.max(0, 100 - completed) }; };
const collectedOn = (loan, date = today()) => loan.transactions.some(transaction => transaction.date === date && paymentValue(loan, transaction) > 0);
const accountOutcome = loan => {
  const status = loanStatus(loan);
  if (!['completed', 'closed', 'bankrupt'].includes(status)) return null;
  const completionPayment = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date))[0];
  const date = status === 'completed' ? completionPayment?.date : loan.statusChangedAt ? new Date(loan.statusChangedAt).toLocaleDateString('en-CA') : '';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return { label, date, days: date ? elapsedDays(loan.startDate, date) + 1 : null };
};
const annualRate = (loan, date) => Number([...loan.rateChanges].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).filter(r => r.effectiveDate <= date).at(-1)?.annualRate || loan.annualRate || 0);
const txTotal = (loan, key) => loan.transactions.reduce((s, t) => s + Number(t[key] || 0), 0);
const dailyPaid = loan => txTotal(loan, "amount");
const dailyBalance = loan => Math.max(0, loan.collectionAmount - dailyPaid(loan));
const monthlyPrincipalPaid = (loan, before) => loan.transactions.filter(t => !before || t.date < before).reduce((s, t) => s + Number(t.principalAmount || 0), 0);
const monthlyBalance = (loan, before) => Math.max(0, loan.principal - monthlyPrincipalPaid(loan, before));
const monthlyInterestPaid = loan => txTotal(loan, "interestAmount");
const monthlyPenaltyPaid = loan => txTotal(loan, "penaltyAmount");
const monthlyDueRows = loan => {
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
      interest: monthlyInterestOnBalance(balance, annualRate(loan, dueDate))
    });
  }
  return rows;
};
const monthlyInterestDue = loan => monthlyDueRows(loan).reduce((s, r) => s + r.interest, 0);
const monthlyInterestPending = loan => Math.max(0, monthlyInterestDue(loan) - monthlyInterestPaid(loan));
const missedMonths = loan => {
  let remaining = monthlyInterestPaid(loan);
  return monthlyDueRows(loan).filter(r => {
    remaining -= r.interest;
    return remaining < 0;
  }).length;
};
const estimatedPenalty = loan => Math.round(monthlyInterestPending(loan) * Number(loan.penaltyRate || 0) / 100);
const loanBalance = loan => loan.status === "bankrupt" ? 0 : loan.kind === "daily" ? dailyBalance(loan) : monthlyBalance(loan);
const loanPaid = loan => loan.kind === "daily" ? dailyPaid(loan) : txTotal(loan, "principalAmount") + monthlyInterestPaid(loan) + monthlyPenaltyPaid(loan);
const loanStatus = loan => loan.status === "bankrupt" || loan.status === "closed" ? loan.status : loanBalance(loan) <= 0 ? "completed" : loan.kind === "daily" ? elapsedDays(loan.startDate) >= 100 ? "overdue" : "active" : monthlyInterestPending(loan) > 0 ? "overdue" : "active";
const sample = [{
  id: "D1001",
  customerId: "C001",
  pin: "0000",
  customerName: "Ramesh Kumar",
  phone: "9876543210",
  address: "Coimbatore",
  kind: "daily",
  startDate: addDays(today(), -22),
  collectionAmount: 10000,
  disbursedAmount: 8500,
  dailyCollection: 100,
  transactions: Array.from({
    length: 18
  }, (_, i) => ({
    id: `D${i}`,
    date: addDays(today(), -18 + i),
    amount: 100,
    mode: i % 2 ? "cash" : "upi",
    ref: ""
  }))
}, {
  id: "M1001",
  customerId: "C002",
  pin: "0000",
  customerName: "Priya Sundaram",
  phone: "9845001234",
  address: "Chennai",
  kind: "monthly",
  startDate: addMonths(today(), -4),
  principal: 100000,
  annualRate: 3,
  penaltyRate: 5,
  rateChanges: [],
  transactions: [{
    id: "M1",
    date: addMonths(today(), -3),
    interestAmount: 3000,
    principalAmount: 0,
    penaltyAmount: 0,
    mode: "upi",
    ref: "UPI-102"
  }, {
    id: "M2",
    date: addMonths(today(), -2),
    interestAmount: 3000,
    principalAmount: 10000,
    penaltyAmount: 0,
    mode: "bank",
    ref: "NEFT-81"
  }, {
    id: "M3",
    date: addMonths(today(), -1),
    interestAmount: 2700,
    principalAmount: 0,
    penaltyAmount: 0,
    mode: "cash",
    ref: ""
  }]
}];
const styles = `@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@600;700&display=swap');*{box-sizing:border-box}body{margin:0;background:${C.bg};color:${C.text};font-family:DM Sans,system-ui}button,input,select{font:inherit}button{cursor:pointer}.app{min-height:100vh}.shell{max-width:1240px;margin:auto;padding:24px}.top,.row,.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.top{margin-bottom:28px}.brand{font:700 28px Syne;color:${C.gold}}.sub,.small{font-size:12px;color:${C.muted}}.tabs{display:flex;gap:8px;flex-wrap:wrap}.btn{padding:9px 13px;background:transparent;border:1px solid ${C.line};color:${C.text};border-radius:9px;font-weight:600}.btn.primary{background:${C.gold};border-color:${C.gold};color:#211907}.btn.danger{color:${C.red};border-color:#ff737355}.tab.active{color:${C.gold};border-color:${C.gold};background:#f4b94218}.card{padding:18px;background:${C.card};border:1px solid ${C.line};border-radius:14px}.grid{display:grid;gap:14px}.metrics{grid-template-columns:repeat(auto-fit,minmax(155px,1fr));margin:18px 0 22px}.two{grid-template-columns:minmax(0,1.3fr) minmax(300px,.7fr)}.metric-label{font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.08em}.metric-value{font:700 22px Syne;margin-top:8px}.gold{color:${C.gold}}.green{color:${C.green}}.red{color:${C.red}}.blue{color:${C.blue}}.title{font:700 22px Syne;margin:0 0 4px}.copy{margin:0;color:${C.muted};font-size:13px}.field{display:flex;flex-direction:column;gap:6px;flex:1}.field label{font-size:12px;color:${C.muted};font-weight:600}.field input,.field select{border:1px solid ${C.line};border-radius:8px;padding:10px;background:${C.surface};color:${C.text};width:100%}.form{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.span{grid-column:1/-1}.table{overflow:auto}.table table{border-collapse:collapse;width:100%;font-size:13px}.table th{text-align:left;color:${C.muted};font-size:11px;letter-spacing:.04em}.table td,.table th{padding:11px 9px;border-bottom:1px solid ${C.line};white-space:nowrap}.badge{font-size:10px;border-radius:14px;padding:4px 8px;font-weight:700;text-transform:uppercase}.badge.active{color:${C.blue};background:#72aaff18}.badge.overdue{color:${C.red};background:#ff737318}.badge.completed{color:${C.green};background:#4fd08d18}.notice{font-size:12px;line-height:1.5;background:#f4b94216;color:#f7dc99;border-left:3px solid ${C.gold};padding:10px 12px;border-radius:7px;margin:14px 0}.modal-bg{position:fixed;inset:0;padding:16px;background:#000b;z-index:10;display:flex;align-items:center;justify-content:center}.modal{width:min(720px,100%);max-height:92vh;overflow:auto;padding:22px;background:${C.card};border:1px solid ${C.line};border-radius:16px}.login{max-width:390px;margin:12vh auto}.login .card{padding:28px}.spacer{margin-top:18px}@media(max-width:680px){.shell{padding:16px}.top{align-items:flex-start;flex-direction:column}.two,.form{grid-template-columns:1fr}.span{grid-column:auto}.hide{display:none}}`;
const enhancements = `.financier-nav{position:fixed;z-index:6;left:20px;top:50%;transform:translateY(-50%);width:194px;padding:14px;background:#151b27eF;border:1px solid ${C.line};border-radius:16px;box-shadow:0 20px 50px #0007;backdrop-filter:blur(12px)}.financier-nav .nav-title{font:700 16px Syne;color:${C.gold};padding:6px 8px 15px}.financier-nav button{width:100%;text-align:left;margin:3px 0}.financier-nav .nav-footer{border-top:1px solid ${C.line};margin-top:12px;padding-top:12px;color:${C.muted};font-size:11px}.tool-stack{display:flex;gap:8px;flex-direction:column;align-items:stretch}@media(max-width:1050px){.financier-nav{top:auto;bottom:14px;left:14px;right:14px;transform:none;width:auto;display:flex;gap:8px;padding:9px}.financier-nav .nav-title,.financier-nav .nav-footer{display:none}.financier-nav button{margin:0;text-align:center;font-size:12px}}html[data-ft-role="unknown"] .financier-nav,html[data-ft-role="staff"] .financier-nav,html[data-ft-role="unknown"] .dashboard-chit,html[data-ft-role="staff"] .dashboard-chit,html[data-ft-role="unknown"] .financier-tools,html[data-ft-role="staff"] .financier-tools{display:none!important}`;
const homeReportHide = `.shell > .toolbar > .tabs > .field,.shell > .toolbar > .tabs > .field + .btn{display:none}`;
const visualRefresh = `
:root{font:16px/1.45 DM Sans,system-ui,sans-serif!important;color-scheme:dark!important;background:#0e1118!important}#root{width:100%!important;max-width:none!important;min-height:100svh!important;margin:0!important;border:0!important;display:block!important;text-align:left!important}.app{min-height:100svh;background:radial-gradient(700px 480px at 4% -10%,#202b41 0%,transparent 65%),#0e1118;color:#f4f6fb}.shell{max-width:1420px;padding:36px 44px 74px}.top{margin-bottom:34px}.brand{font-family:Syne,DM Sans,sans-serif;font-size:27px;letter-spacing:-.8px;color:#f4b942}.sub{margin-top:6px;color:#9ba9bd;font-size:12px;letter-spacing:.02em}.title{font-family:Syne,DM Sans,sans-serif;font-size:28px;letter-spacing:-.7px;color:#f4f6fb!important}.shell .title,.shell .title *{color:#f4f6fb!important}.copy{color:#9ba9bd;font-size:13px}.toolbar{gap:18px}.tabs{gap:7px}.btn{min-height:38px;padding:8px 13px;border:1px solid #303a4d;background:#171c27;color:#f4f6fb;border-radius:10px;font-size:13px;font-weight:700;transition:background .18s,border-color .18s,transform .18s,box-shadow .18s}.btn:hover{transform:translateY(-1px);background:#242c3b;border-color:#4a586f;box-shadow:0 6px 16px #0005}.btn:focus-visible{outline:3px solid #f4b94255;outline-offset:2px}.btn.primary{background:#f4b942;color:#211907;border-color:#f4b942;box-shadow:0 6px 14px #0004}.btn.primary:hover{background:#ffd062;border-color:#ffd062}.btn.danger{border-color:#ff737355;color:#ff9898;background:#3c1b221f}.btn.danger:hover{background:#492027}.btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}.tab{background:transparent;color:#9ba9bd;border-color:transparent;box-shadow:none}.tab:hover{background:#ffffff0c;border-color:transparent}.tab.active{background:#f4b94218;color:#f4b942;border-color:#f4b94270;box-shadow:none}.card{background:#202737;border:1px solid #303a4d;border-radius:16px;box-shadow:0 8px 24px #0003}.card:hover{border-color:#46536a}.metrics{gap:16px;margin:22px 0 26px}.metrics .card{position:relative;overflow:hidden;padding:18px 19px;background:linear-gradient(145deg,#222c3e,#1b2230)}.metrics .card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#f4b942}.metric-label{font-size:10px;font-weight:700;color:#9ba9bd;letter-spacing:.09em}.metric-value{font-family:Syne,DM Sans,sans-serif;font-size:24px;letter-spacing:-.65px;margin-top:9px}.gold{color:#f4b942}.green{color:#4fd08d}.red{color:#ff7373}.blue{color:#72aaff}.field{gap:7px}.field label{font-size:11px;letter-spacing:.035em;color:#aab7ca}.field input,.field select{min-height:41px;padding:9px 11px;border-radius:10px;border-color:#303a4d;background:#171c27;color:#f4f6fb;outline:none;transition:border-color .15s,box-shadow .15s}.field input:focus,.field select:focus{border-color:#f4b942;box-shadow:0 0 0 3px #f4b9421c}.table{border:1px solid #303a4d;border-radius:12px}.table table{font-size:13px}.table th{padding:12px 13px;background:#171c27;color:#9ba9bd;font-size:10px;letter-spacing:.08em}.table td{padding:13px;border-color:#303a4d;color:#e4e9f2}.table tbody tr{transition:background .15s}.table tbody tr:hover{background:#ffffff08}.badge{padding:5px 9px;border-radius:999px;font-size:9px;letter-spacing:.06em}.notice{border:1px solid #f4b94255;border-left:3px solid #f4b942;background:#f4b94216;color:#f7dc99;border-radius:10px;padding:11px 13px}.modal-bg{padding:24px;background:#000b;backdrop-filter:blur(5px)}.modal{width:min(760px,100%);padding:28px;border-radius:19px;background:#202737;border-color:#46536a;box-shadow:0 25px 80px #000a}.login{max-width:450px;margin:10vh auto}.login>.brand{font-size:34px;color:#f4b942;text-align:center}.login>.sub{font-size:13px;text-align:center}.login .card{padding:26px;background:#202737;border-color:#3c475c;box-shadow:0 22px 70px #0008}.login .tabs{display:grid;grid-template-columns:1fr 1fr}.login .tabs .btn:last-child{grid-column:1/-1}.login .tab{min-height:42px;border:1px solid #303a4d}.login .tab.active{border-color:#f4b94270}.financier-nav{background:#202737!important;border-color:#3a465a!important;border-radius:16px!important;box-shadow:0 12px 34px #0008!important}.financier-nav .nav-title{color:#f4b942!important;font-family:Syne,DM Sans,sans-serif!important}.financier-nav button{border-color:transparent!important}.financier-nav button.tab.active{background:#f4b94218!important;border-color:#f4b94270!important}.financier-nav .nav-footer{color:#9ba9bd!important;border-color:#303a4d!important}.customer-actions{right:28px!important;bottom:auto!important;top:20px!important;background:#202737!important;padding:8px!important;border:1px solid #3a465a!important;border-radius:14px!important;box-shadow:0 12px 30px #0008!important}@media(min-width:1051px){.shell{margin-left:240px;max-width:calc(1420px + 240px)}.financier-nav{left:24px!important;top:28px!important;transform:none!important;width:192px!important}}@media(max-width:1050px){.shell{padding:28px 24px 86px}.financier-nav{background:#202737f2!important}}@media(max-width:680px){.shell{padding:22px 16px 98px}.top,.toolbar{align-items:flex-start}.toolbar{flex-direction:column}.title{font-size:24px}.metrics{grid-template-columns:1fr 1fr}.metrics .card{padding:15px}.metric-value{font-size:20px}.login{margin:5vh 16px}.modal{padding:21px}.customer-actions{top:auto!important;bottom:12px!important;left:12px!important;right:12px!important}.customer-actions .tabs{justify-content:center}.form{gap:11px}}`;
const creditScoreStyles = `.credit-score-card{padding:16px 18px}.credit-score-card-main{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.credit-score-card-copy{flex:1;min-width:220px;display:grid;gap:6px;justify-items:start}.credit-score-kicker{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9ba9bd}.credit-score-number{font:700 36px Syne,sans-serif;line-height:1}.credit-score-number.muted{font-size:22px;color:#9ba9bd}.credit-score-rating{display:inline-block;font:700 13px DM Sans,sans-serif;letter-spacing:.04em;text-transform:uppercase}.credit-score-rating.excellent,.credit-score-pill.excellent{color:#4fd08d}.credit-score-rating.good,.credit-score-pill.good{color:#8fd14f}.credit-score-rating.fair,.credit-score-pill.fair{color:#f4b942}.credit-score-rating.attention,.credit-score-pill.attention{color:#f08a4b}.credit-score-rating.high_risk,.credit-score-pill.high_risk{color:#ff7373}.credit-score-mini-stats{display:flex;flex-wrap:wrap;gap:8px 14px;color:#9ba9bd;font-size:12px}.credit-score-why{display:grid;gap:4px;margin-top:12px}.credit-score-why p{margin:0;font-size:13px}.credit-score-why-good{color:#8fd14f}.credit-score-why-bad{color:#ff9898}.credit-score-disclaimer{margin-top:10px;color:#9ba9bd}.credit-score-gauge-wrap{background:#f7f4ee;border-radius:18px;padding:6px 8px 2px;box-shadow:inset 0 0 0 1px #e4dccf}.credit-score-gauge{display:block;overflow:visible}.credit-score-gauge-label{fill:#4b5563;font:700 8px DM Sans,sans-serif;letter-spacing:.03em}.credit-score-gauge-range{fill:#fff;font:700 8px DM Sans,sans-serif}.credit-score-gauge-title{fill:#4b5563;font:700 12px DM Sans,sans-serif;letter-spacing:.1em}.credit-score-pill{display:inline-block;margin-top:4px;padding:2px 7px;border-radius:999px;background:#171d29;border:1px solid #303a4d;font-size:10px;font-weight:700;letter-spacing:.03em}.credit-score-pill.muted{color:#9ba9bd}.credit-score-modal{max-width:720px}.credit-score-details-hero{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.credit-score-factors{margin:6px 0 0;padding-left:18px}.credit-score-factors.good li{color:#8fd14f}.credit-score-factors.bad li{color:#ff9898}.credit-score-weight-list{display:grid;gap:6px}.credit-score-weight-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:#c5d0de}.credit-score-recent,.credit-score-history{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:6px}.credit-score-recent li.good{color:#8fd14f}.credit-score-recent li.warn{color:#f4b942}.credit-score-recent li.bad{color:#ff7373}.credit-score-history li{display:flex;justify-content:space-between;gap:12px}@media(max-width:680px){.credit-score-card-main{flex-direction:column;align-items:stretch}.credit-score-gauge{width:100%;max-width:320px;margin:0 auto}}`;
const accountsStyles = `.financier-nav-more{display:grid;gap:6px;padding:0 8px 10px;border-bottom:1px solid #303a4d;margin-bottom:8px}.financier-nav-more .btn{width:100%;justify-content:flex-start;text-align:left;min-height:36px;font-size:12px}.accounts-module{max-width:980px}.accounts-notice-ok{border-color:#4fd08d55!important;color:#4fd08d!important}.accounts-section-nav{display:flex;gap:0;border-bottom:1px solid #303a4d;overflow-x:auto;-webkit-overflow-scrolling:touch}.accounts-section-tab{flex:0 0 auto;padding:10px 14px 12px;background:transparent;border:0;border-bottom:2px solid transparent;color:#9ba9bd;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}.accounts-section-tab:hover{color:#f4f6fb}.accounts-section-tab.active{color:#f4b942;border-bottom-color:#f4b942}.accounts-panel{padding-top:18px}.accounts-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:4px}.accounts-panel-title{margin:0;font:700 20px Syne,sans-serif;color:#f4f6fb}.accounts-balance-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:16px}.accounts-balance-item{padding:14px 16px;border-radius:14px;background:#202737;border:1px solid #303a4d}.accounts-balance-item span{display:block;color:#9ba9bd;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}.accounts-balance-item strong{display:block;font:700 20px Syne,sans-serif;line-height:1.1}.accounts-balance-move{border-color:#303a4d88;background:#171d29}.accounts-filter-card{padding:14px 16px;display:grid;gap:12px}.accounts-period-bar{display:grid;gap:10px}.accounts-period-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.accounts-period-pill{width:100%;min-height:36px;padding:7px 10px;font-size:12px;border-radius:999px}.accounts-period-pill.active{background:#f4b94218;border-color:#f4b942;color:#f4b942}.accounts-custom-range{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.accounts-custom-range input[type=date]{min-height:38px;padding:7px 10px;border:1px solid #303a4d;border-radius:10px;background:#171c27;color:#f4f6fb}.accounts-filter-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(120px,.45fr) minmax(120px,.45fr);gap:10px;align-items:end}.accounts-search,.accounts-filter-field select{width:100%;min-height:40px;padding:9px 11px;border:1px solid #303a4d;border-radius:10px;background:#171c27;color:#f4f6fb;outline:none}.accounts-search:focus,.accounts-filter-field select:focus{border-color:#f4b942;box-shadow:0 0 0 3px #f4b9421c}.accounts-filter-field{display:grid;gap:4px}.accounts-filter-field .small{text-transform:uppercase;letter-spacing:.06em;font-size:10px;color:#9ba9bd}.accounts-action-row{display:flex;flex-wrap:wrap;gap:8px}.accounts-entry-list{display:grid;gap:8px}.accounts-entry-row{padding:14px 16px}.accounts-entry-main{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.accounts-entry-copy{min-width:0}.accounts-entry-amounts{display:grid;gap:3px;text-align:right;flex-shrink:0}.accounts-entry-amounts .green,.accounts-entry-amounts .red{font:700 16px Syne,sans-serif}.accounts-entry-balance{color:#9ba9bd}.accounts-entry-meta{margin-top:8px;color:#9ba9bd}.accounts-entry-delete{margin-top:10px;padding:6px 10px;font-size:12px}.accounts-expense-row .accounts-entry-main{align-items:center}.accounts-expense-amount{font:700 18px Syne,sans-serif}.accounts-empty{padding:28px 20px;text-align:center;color:#9ba9bd}.accounts-ledger-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.accounts-ledger-card{padding:16px;display:grid;gap:6px}.accounts-ledger-type{display:inline-block;width:fit-content;padding:2px 8px;border-radius:999px;background:#f4b94214;color:#f4b942;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.accounts-ledger-name{font-size:15px;color:#f4f6fb}.accounts-ledger-balance{font:700 22px Syne,sans-serif;color:#f4f6fb}.accounts-form-card,.accounts-info-card,.accounts-report-card{padding:16px 18px}.accounts-info-card .copy{margin:0}.accounts-closing-row{padding:16px 18px;display:grid;gap:12px}.accounts-closing-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap}.accounts-closing-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.accounts-closing-stats>div{padding:10px 12px;border-radius:10px;background:#171d29;border:1px solid #303a4d}.accounts-closing-stats span{display:block;margin-bottom:4px;color:#9ba9bd;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.accounts-closing-stats strong{font:700 16px Syne,sans-serif}.accounts-closing-ok strong{color:#4fd08d}.accounts-closing-bad strong{color:#ff7373}.accounts-report-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.accounts-origin-note{color:#9ba9bd;margin-top:8px}.accounts-summary-card{padding:14px 16px}.accounts-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.accounts-summary-grid span{display:block;color:#9ba9bd;font-size:10px;text-transform:uppercase;letter-spacing:.06em}@media(max-width:820px){.accounts-balance-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.accounts-filter-row{grid-template-columns:1fr 1fr}.accounts-search{grid-column:1/-1}.accounts-period-pills{grid-template-columns:repeat(2,minmax(0,1fr))}.accounts-closing-stats{grid-template-columns:1fr}}@media(max-width:560px){.accounts-balance-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.accounts-filter-row{grid-template-columns:1fr}.accounts-entry-main{flex-direction:column}.accounts-entry-amounts{text-align:left;grid-auto-flow:column;grid-auto-columns:max-content;align-items:center;gap:10px}.accounts-summary-grid{grid-template-columns:1fr 1fr}}`;
const mobileCollections = `.customer-search,.collection-search{display:flex;gap:8px;align-items:center;margin:14px 0}.customer-search input,.collection-search input{width:min(460px,100%);min-height:42px;padding:10px 12px;border:1px solid #303a4d;border-radius:10px;background:#171c27;color:#f4f6fb;outline:none}.customer-search input:focus,.collection-search input:focus{border-color:#f4b942;box-shadow:0 0 0 3px #f4b9421c}.collection-shell{max-width:970px}.collection-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.collection-summary>div{padding:15px 17px;border-radius:14px;background:#202737;border:1px solid #303a4d}.collection-summary span,.collection-amount span{display:block;color:#9ba9bd;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.collection-summary strong{display:block;margin-top:7px;font:700 22px Syne}.collection-section{margin-top:28px}.collection-route-table{margin-top:12px}.collection-row-collected{opacity:.72}.collection-section h2{font:700 18px Syne;margin:0 0 6px;color:#f4f6fb}.collection-section h2 span{font:600 11px DM Sans;color:#9ba9bd;margin-left:7px;letter-spacing:.04em;text-transform:uppercase}.collection-list{display:grid;gap:10px;margin-top:12px}.collection-card{display:grid;grid-template-columns:46px minmax(160px,1fr) 130px auto;gap:14px;align-items:center;padding:15px;background:#202737;border:1px solid #303a4d;border-radius:15px}.monthly-card{border-left:3px solid #72aaff}.daily-card{border-left:3px solid #f4b942}.collection-card.collected{opacity:.72;border-color:#4fd08d55}.collection-avatar{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#72aaff1c;color:#72aaff;font-weight:800}.collection-info{display:grid;gap:2px}.collection-info strong{font-size:15px}.collection-info span,.collection-amount small{font-size:12px;color:#9ba9bd}.collection-amount{text-align:right}.collection-amount strong{display:block;margin:3px 0;font-size:16px}.collection-actions{display:flex;gap:7px}.route-handle{user-select:none;-webkit-user-select:none;touch-action:none;cursor:grab;font-weight:700;color:#f4b942}.route-handle:active{cursor:grabbing}.route-row-dragging{opacity:.55;background:#f4b94212}.link-button{display:inline-flex;align-items:center;margin-top:12px;padding:0;border:0;background:none;color:#f4b942;font:600 13px DM Sans,system-ui;cursor:pointer}.link-button:hover{text-decoration:underline}.link-button:disabled{opacity:.55;cursor:wait}@media(max-width:680px){.collection-shell{margin-left:0!important;padding-bottom:28px}.customer-search,.collection-search{width:100%}.customer-search input,.collection-search input{flex:1}.collection-summary{grid-template-columns:1fr 1fr}.collection-summary>div:last-child{grid-column:1/-1}.collection-card{grid-template-columns:42px 1fr auto;gap:10px;padding:13px}.collection-avatar{width:42px;height:42px}.collection-info span:last-child{display:none}.collection-amount{grid-column:2;text-align:left}.collection-actions{grid-column:3;grid-row:1 / span 2;flex-direction:column}.collection-actions .btn{min-width:74px}.collection-actions .btn:first-child{display:none}}`;
const mobileLayout = `
.nav-short,.label-short{display:none}
.nav-label{display:inline-flex;align-items:center;gap:7px}
.dashboard-finance-table td:first-child{white-space:normal}
.top-actions{display:flex;flex-direction:row;align-items:center;gap:8px;flex-shrink:0}
@media(max-width:1050px){
  html{scroll-padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}
  .shell{padding:16px 16px calc(96px + env(safe-area-inset-bottom,0px))!important}
  .dashboard-home{padding-bottom:12px!important}
  .dashboard-home .dashboard-finance-section:last-of-type{margin-bottom:0}
  .dashboard-chit{margin-top:16px!important;padding:0 16px calc(96px + env(safe-area-inset-bottom,0px))!important}
  .dashboard-chit .dashboard-chit-panel{margin-top:0}
  .collection-shell{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important}
  .chit-dashboard .shell{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))!important}
  .financier-nav{display:flex!important;flex-wrap:nowrap!important;align-items:stretch;gap:4px!important;padding:6px!important;bottom:max(8px,env(safe-area-inset-bottom,0px))!important;left:10px!important;right:10px!important;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .financier-nav::-webkit-scrollbar{display:none}
  .financier-nav button{flex:1 1 0!important;width:auto!important;min-width:0!important;min-height:48px;margin:0!important;padding:5px 2px!important;font-size:10px!important;line-height:1.15;white-space:nowrap;text-align:center;overflow:hidden}
  .financier-nav .nav-label{width:100%;flex-direction:column;gap:3px;justify-content:center}
  .nav-glyph{font-size:14px;line-height:1}
  .nav-long{display:none}
  .nav-short{display:inline}
  .dashboard-finance-metrics{grid-template-columns:1fr 1fr!important;gap:10px!important;margin:14px 0 16px!important}
}
@media(max-width:680px){
  .top{flex-direction:row!important;align-items:flex-start!important;margin-bottom:12px!important;gap:10px!important}
  .top-actions{flex-direction:column;align-items:stretch}
  .top-actions .btn{min-width:118px;justify-content:center;text-align:center}
  .brand{font-size:20px!important;letter-spacing:-.4px}
  .sub{margin-top:2px!important;font-size:11px!important}
  .shell>.toolbar{gap:10px!important;align-items:flex-start}
  .title{font-size:22px!important}
  .dashboard-home>.toolbar .copy,.dashboard-finance-heading .small{display:none}
  .label-full{display:none}
  .label-short{display:inline}
  .dashboard-finance-section{padding:14px!important;margin-bottom:14px}
  .dashboard-finance-heading{gap:10px!important;margin-bottom:12px}
  .dashboard-finance-icon{width:34px;height:34px;font-size:16px}
  .metrics .card{padding:12px 13px!important}
  .metric-value{font-size:18px!important;margin-top:6px!important}
  .dashboard-finance-table{border:0;padding:0;overflow:visible}
  .dashboard-finance-table table,.dashboard-finance-table tbody{display:block;width:100%}
  .dashboard-finance-table thead{display:none}
  .dashboard-finance-table tr{display:grid;grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:"cust amt view" "cust bal view";gap:2px 12px;align-items:center;padding:12px;margin:0 0 8px;background:#171d29;border:1px solid #303a4d;border-radius:12px}
  .dashboard-finance-table td,.dashboard-finance-table th{border:0;padding:0;white-space:normal}
  .dashboard-finance-table td:nth-child(1){grid-area:cust;min-width:0}
  .dashboard-finance-table td:nth-child(2){grid-area:amt;text-align:right}
  .dashboard-finance-table td:nth-child(3){grid-area:bal;text-align:right}
  .dashboard-finance-table td:nth-child(4){grid-area:view}
  .dashboard-finance-table td[data-label]:before{content:attr(data-label);display:block;color:#9ba9bd;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .dashboard-finance-table .btn{min-height:34px;padding:6px 10px;font-size:12px}
  .dashboard-finance-table.can-reorder tr{grid-template-columns:32px minmax(0,1fr) auto auto;grid-template-areas:"handle cust amt view" "handle cust bal view"}
  .dashboard-finance-table.can-reorder td:nth-child(1){grid-area:handle;align-self:center}
  .dashboard-finance-table.can-reorder td:nth-child(2){grid-area:cust;min-width:0}
  .dashboard-finance-table.can-reorder td:nth-child(3){grid-area:amt;text-align:right}
  .dashboard-finance-table.can-reorder td:nth-child(4){grid-area:bal;text-align:right}
  .dashboard-finance-table.can-reorder td:nth-child(5){grid-area:view}
  .dashboard-finance-table.collection-route-table.can-reorder tr{grid-template-columns:32px minmax(0,1fr) auto auto;grid-template-areas:"handle cust due actions" "handle cust bal actions"}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(1){grid-area:handle;align-self:center}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(2){grid-area:cust;min-width:0}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(3){grid-area:due;text-align:right}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(4){grid-area:bal;text-align:right}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(5){display:none}
  .dashboard-finance-table.collection-route-table.can-reorder td:nth-child(6){grid-area:actions;grid-row:1 / span 2;align-self:center;display:flex;flex-direction:column;gap:6px;align-items:stretch}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) tr{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:"cust due actions" "cust bal actions"}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) td:nth-child(1){grid-area:cust;min-width:0}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) td:nth-child(2){grid-area:due;text-align:right}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) td:nth-child(3){grid-area:bal;text-align:right}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) td:nth-child(4){display:none}
  .dashboard-finance-table.collection-route-table:not(.can-reorder) td:nth-child(5){grid-area:actions;grid-row:1 / span 2;align-self:center;display:flex;flex-direction:column;gap:6px;align-items:stretch}
  .dashboard-drag-handle{display:grid;place-items:center;min-width:32px;min-height:44px;padding:0 4px;border-radius:8px;background:#f4b94214;color:#f4b942}
  .upcoming-payments-toolbar{flex-direction:column;align-items:stretch!important}
  .upcoming-payments-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;width:100%}
  .upcoming-payments-filters .btn.tab{width:100%;min-height:36px}
  .upcoming-payments-table{border:0;padding:0;overflow:visible}
  .upcoming-payments-table table,.upcoming-payments-table tbody{display:block;width:100%}
  .upcoming-payments-table thead{display:none}
  .upcoming-payments-table tr{display:grid;gap:4px 10px;padding:12px;margin:0 0 8px;background:#171d29;border:1px solid #303a4d;border-radius:12px}
  .upcoming-payments-table td{border:0;padding:0;white-space:normal}
  .upcoming-payments-table.monthly tr{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name amt" "due due" "act act"}
  .upcoming-payments-table.monthly td:nth-child(1){grid-area:name}
  .upcoming-payments-table.monthly td:nth-child(2){grid-area:amt;text-align:right}
  .upcoming-payments-table.monthly td:nth-child(3){grid-area:due}
  .upcoming-payments-table.monthly td:nth-child(4){grid-area:act}
  .upcoming-payments-table.chit tr{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"name amt" "scheme scheme" "type type" "due due" "act act"}
  .upcoming-payments-table.chit td:nth-child(1){grid-area:name}
  .upcoming-payments-table.chit td:nth-child(2){grid-area:scheme}
  .upcoming-payments-table.chit td:nth-child(3){grid-area:type}
  .upcoming-payments-table.chit td:nth-child(4){grid-area:amt;text-align:right}
  .upcoming-payments-table.chit td:nth-child(5){grid-area:due}
  .upcoming-payments-table.chit td:nth-child(6){grid-area:act}
  .finance-module-shell .finance-module-body{scroll-margin-top:12px}
  .finance-module-shell .grid.metrics{transition:opacity .12s ease}
}
@media(max-width:1050px) and (max-height:500px){
  .shell{padding:10px 14px calc(72px + env(safe-area-inset-bottom,0px))!important}
  .dashboard-home{padding-bottom:10px!important}
  .dashboard-chit{margin-top:12px!important;padding:0 14px calc(72px + env(safe-area-inset-bottom,0px))!important}
  .top{margin-bottom:8px!important}
  .brand{font-size:18px!important}
  .title{font-size:18px!important}
  .copy,.dashboard-finance-heading .small{display:none}
  .label-full{display:none}
  .label-short{display:inline}
  .shell>.toolbar{flex-direction:row!important;align-items:center!important;gap:10px!important}
  .dashboard-finance-section{padding:12px!important;margin-bottom:10px}
  .dashboard-finance-heading{margin-bottom:8px}
  .dashboard-finance-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin:8px 0 10px!important}
  .metrics .card{padding:8px 10px!important}
  .metric-label{font-size:8px!important}
  .metric-value{font-size:14px!important;margin-top:4px!important}
  .financier-nav{padding:4px!important;bottom:max(6px,env(safe-area-inset-bottom,0px))!important}
  .financier-nav button{min-height:40px;font-size:9px!important}
}
`;
const receiptStyles = `.receipt-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.receipt-actions.compact .btn{padding:5px 8px;font-size:11px}.btn.whatsapp{border-color:#25d36655;color:#8ef0b0;background:#143522}.btn.whatsapp:hover{background:#1d4a30;border-color:#25d366}.receipt-success .tool-stack{display:grid;gap:8px}.receipt-paper{padding:18px;border:1px solid ${C.line};border-radius:12px;background:${C.surface}}.receipt-header{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}.receipt-header strong{font:700 18px Syne;color:${C.gold}}.receipt-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:${C.muted}}.receipt-paper hr{border:0;border-top:1px solid ${C.line};margin:12px 0}.receipt-paper section{margin-bottom:10px}.upcoming-payments .tabs{flex-wrap:wrap}.upcoming-payments-toolbar{align-items:flex-start;gap:12px}.upcoming-payments-heading{flex:1;min-width:0}.upcoming-payments-toggle{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 10px;min-height:44px}.upcoming-payments-toggle:focus-visible{outline:2px solid #f4b942;outline-offset:2px}.upcoming-payments-chevron{display:inline-flex;width:1.1em;justify-content:center;color:#f4b942;font-size:14px}.upcoming-payments-title-wrap{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}.upcoming-payments-count{display:block}.upcoming-payments-toggle-label{margin-left:auto;white-space:nowrap;font-size:12px;color:#9ba9bd;font-weight:600}.upcoming-payments.is-collapsed{padding-bottom:14px}.upcoming-payments-summary{margin:0}.upcoming-payments-error{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.upcoming-payments-filters .btn.tab{padding:6px 10px;font-size:12px}.upcoming-payments-table td:last-child,.upcoming-payments-table th:last-child{white-space:nowrap}.chit-type-badge{display:inline-flex;padding:3px 8px;border-radius:999px;background:#72aaff16;color:#8eb9ff;font-size:11px;font-weight:700;letter-spacing:.02em}.upcoming-payment-card .metric-value{margin:8px 0}.field textarea{min-height:88px;border:1px solid ${C.line};border-radius:8px;padding:10px;background:${C.surface};color:${C.text};width:100%;resize:vertical}.customer-statement-page .statement-controls .form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end}.statement-summary{display:grid;gap:8px;margin-top:12px}.statement-summary-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid ${C.line};font-size:13px}.statement-summary-row.emphasize strong{color:${C.gold};font-size:16px}.statement-outstanding{font-size:22px}.statement-account .toolbar{align-items:flex-start}.statement-payments{overflow:auto}@media(max-width:720px){.upcoming-payments-toggle{align-items:flex-start}.upcoming-payments-toggle-label{margin-left:0}.statement-payments table,.statement-payments thead,.statement-payments tbody,.statement-payments th,.statement-payments td,.statement-payments tr{display:block}.statement-payments thead{display:none}.statement-payments tr{padding:12px 0;border-bottom:1px solid ${C.line}}.statement-payments td{padding:4px 0}.statement-payments td:before{content:attr(data-label);display:block;color:${C.muted};font-size:11px;margin-bottom:2px}}`;
const Button = ({
  children,
  className = "",
  ...props
}) => <button className={`btn ${className}`} {...props}>{children}</button>;
const Field = ({
  label,
  children,
  className = ""
}) => <div className={`field ${className}`}><label>{label}</label>{children}</div>;
const Metric = ({
  label,
  value,
  color = ""
}) => <div className="card"><div className="metric-label">{label}</div><div className={`metric-value ${color}`}>{value}</div></div>;
const Badge = ({
  status
}) => <span className={`badge ${status}`}>{status}</span>;
function PasswordRecovery() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async event => {
    event.preventDefault();
    if (!token) { setMessage("This password-reset link is invalid or has expired. Request a new one from Financier sign in."); return; }
    if (password.length < 8) { setMessage("Use a password with at least 8 characters."); return; }
    if (password !== confirmPassword) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      await supabase.auth.updatePassword(password, token);
      setMessage("Password updated successfully. You can now sign in.");
    } catch (error) { setMessage(error.message || "Unable to reset password. Request a new link and try again."); }
    finally { setBusy(false); }
  };
  const complete = message.includes("successfully");
  return <div className="login"><div className="brand" style={{ textAlign: "center" }}>FinTrack</div><p className="sub" style={{ textAlign: "center", marginBottom: 22 }}>Set a new Financier password</p><form className="card" onSubmit={save}><Field label="New password"><input disabled={complete} type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field><div className="spacer"><Field label="Confirm new password"><input disabled={complete} type="password" minLength="8" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></Field></div>{message && <p className="small" style={{ color: complete ? C.green : C.red }}>{message}</p>}{complete ? <Button className="primary spacer" style={{ width: "100%" }} type="button" onClick={() => window.location.assign(window.location.pathname)}>Go to sign in</Button> : <Button className="primary spacer" style={{ width: "100%" }} disabled={busy} type="submit">{busy ? "Saving…" : "Save new password"}</Button>}</form></div>;
}
function FinancierAuth({ onLogin, onCustomerLogin, onChitCustomerLogin }) {
  const [mode, setMode] = useState("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [portalId, setPortalId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const allowSignup = isPublicSignupAllowed();
  const signInAndEnter = async () => {
    const result = await supabase.auth.signIn(email, password);
    const profile = await loadWorkspace(result.access_token);
    if (!profile.active) { await supabase.auth.signOut(); throw new Error("This account has been disabled. Contact your financier."); }
    if (mode === "agent" && profile.role !== "staff") throw new Error("This account is not a Collection Agent. Use Financier sign in.");
    if (mode === "signIn" && profile.role === "staff") throw new Error("Use Collection Agent sign in for this account.");
    onLogin({ role: sessionUserRole(profile.role), authToken: result.access_token, name: profile.fullName, workspace: profile });
  };
  const submit = async () => {
    setMessage(""); setBusy(true);
    try {
      if (mode === "customer") {
        if (!portalId || !password) throw new Error("Enter your portal ID and PIN.");
        onCustomerLogin(await customerPortalLogin(portalId, password));
      } else if (mode === "chitCustomer") {
        if (!portalId || !password) throw new Error("Enter your Chit portal ID and PIN.");
        onChitCustomerLogin(await chitCustomerPortalLogin(portalId, password));
      } else if (mode === "signUp") {
        if (!allowSignup) throw new Error("New business signup is invite-only. Contact FinTrack support for access.");
        if (!businessName || !fullName) throw new Error("Enter your business name and your name.");
        if (!validateSignupInvite(inviteCode)) throw new Error("Enter a valid invite code.");
        const result = await supabase.auth.signUp(email, password);
        const workspace = { workspace_name: businessName, display_name: fullName, invite_code: inviteCode || null };
        if (!result.access_token) {
          throw new Error("Your account could not be signed in automatically. In Supabase, turn off Confirm email under Authentication → Providers → Email, then try again.");
        }
        await supabase.rpc("provision_financier", workspace, result.access_token);
        let profile;
        try {
          profile = await loadWorkspace(result.access_token);
        } catch {
          profile = { role: "owner", businessName, fullName, organizationSettings: {}, active: true, id: "" };
        }
        onLogin({ role: "financier", authToken: result.access_token, name: fullName, workspace: profile });
      } else {
        await signInAndEnter();
      }
    } catch (error) { setMessage(error.message || "Unable to sign in."); }
    finally { setBusy(false); }
  };
  const forgotPassword = async () => {
    if (!email) { setMessage("Enter your business email first, then select Forgot password."); return; }
    setBusy(true); setMessage("");
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setMessage("Password reset email sent. Open the link in the email to set a new password.");
    } catch (error) { setMessage(error.message || "Unable to send the password reset email."); }
    finally { setBusy(false); }
  };
  const isFinanceCustomer = mode === "customer", isChitCustomer = mode === "chitCustomer", isCustomer = isFinanceCustomer || isChitCustomer, isAgent = mode === "agent";
  return <div className="login"><div className="brand" style={{ textAlign: "center" }}>FinTrack</div><p className="sub" style={{ textAlign: "center", marginBottom: 22 }}>{isChitCustomer ? "View your chit schemes, payments, and live bids when they apply" : isFinanceCustomer ? "View your finance balance and payment history" : isAgent ? "Collection Agent workspace" : "Secure workspace for finance businesses"}</p><form className="card" onSubmit={event => { event.preventDefault(); submit(); }}><div className="tabs" style={{ marginBottom: 18 }}><Button type="button" className={`tab ${mode === "signIn" ? "active" : ""}`} onClick={() => setMode("signIn")}>Financier sign in</Button><Button type="button" className={`tab ${mode === "agent" ? "active" : ""}`} onClick={() => setMode("agent")}>Agent login</Button><Button type="button" className={`tab ${mode === "customer" ? "active" : ""}`} onClick={() => setMode("customer")}>Customer login</Button><Button type="button" className={`tab ${mode === "chitCustomer" ? "active" : ""}`} onClick={() => setMode("chitCustomer")}>Chit customer</Button>{allowSignup && <Button type="button" className={`tab ${mode === "signUp" ? "active" : ""}`} onClick={() => setMode("signUp")}>Create business account</Button>}</div>{isCustomer ? <><Field label={isChitCustomer ? "Chit portal ID" : "Customer portal ID"}><input placeholder={isChitCustomer ? "e.g. CF-1A2B3C4D" : "e.g. FT-1A2B3C4D"} value={portalId} onChange={event => setPortalId(event.target.value.toUpperCase())} /></Field><div className="spacer"><Field label="6-digit PIN"><input type="password" inputMode="numeric" minLength="6" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></Field></div></> : <>{mode === "signUp" && <><Field label="Business name"><input placeholder="e.g. Vivek Finance" value={businessName} onChange={event => setBusinessName(event.target.value)} /></Field><div className="spacer"><Field label="Your full name"><input value={fullName} onChange={event => setFullName(event.target.value)} /></Field></div>{signupInviteRequired() && <div className="spacer"><Field label="Invite code"><input value={inviteCode} onChange={event => setInviteCode(event.target.value)} /></Field></div>}</>}<div className="spacer"><Field label={isAgent ? "Agent email" : "Business email"}><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></Field></div><div className="spacer"><Field label="Password"><input type="password" minLength="8" autoComplete={mode === "signIn" || isAgent ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} /></Field></div></>}{mode === "signIn" && <button type="button" className="link-button" onClick={forgotPassword} disabled={busy}>Forgot password?</button>}{message && <p className="small" style={{ color: message.includes("sent") || message.includes("created") ? C.green : C.red }}>{message}</p>}<Button className="primary spacer" style={{ width: "100%" }} disabled={busy} type="submit">{busy ? "Please wait…" : isChitCustomer ? "Open chit dashboard" : isFinanceCustomer ? "Open my dashboard" : mode === "signUp" ? "Create business account" : "Sign in"}</Button></form><p className="small" style={{ textAlign: "center", marginTop: 16 }}><button type="button" className="link-button" onClick={() => openLegalView("privacy")}>Privacy</button> · <button type="button" className="link-button" onClick={() => openLegalView("terms")}>Terms</button></p></div>;
}
const csvCell = value => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
const paymentValue = (loan, transaction) => loan.kind === "daily" ? Number(transaction.amount || 0) : Number(transaction.interestAmount || 0) + Number(transaction.principalAmount || 0) + Number(transaction.penaltyAmount || 0);
const paymentModeLabel = transaction => transaction.mode === "cash_upi" ? `Cash + UPI (Cash ${money(transaction.cashAmount)} · UPI ${money(transaction.upiAmount)})` : transaction.mode === "upi" ? "UPI" : transaction.mode === "cash" ? "Cash" : "Bank transfer";
const expectedCollectionOnDate = (loan, reportDate) => loan.kind === "daily"
  ? Number(loan.dailyCollection || 0)
  : Math.round(monthlyBalance(loan, reportDate) * annualRate(loan, reportDate) / 100);
const downloadDailyReport = (loans, reportDate) => {
  const rows = loans.map(loan => {
    const transactions = loan.transactions.filter(t => t.date === reportDate);
    const actual = transactions.reduce((sum, t) => sum + paymentValue(loan, t), 0);
    const expected = expectedCollectionOnDate(loan, reportDate);
    return [loan.customerName, expected, actual, loanBalance(loan), actual ? "Collected" : "Not collected", transactions.map(paymentModeLabel).join("; ") || "—", transactions.reduce((sum, t) => sum + Number(t.cashAmount || 0), 0), transactions.reduce((sum, t) => sum + Number(t.upiAmount || 0), 0), transactions.map(t => t.collectorName || "Financier/Admin").join("; ") || "—", transactions.map(t => t.notes).filter(Boolean).join("; ") || "—"];
  });
  const totalExpected = rows.reduce((sum, row) => sum + Number(row[1] || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row[2] || 0), 0);
  downloadCsv(`fintrack-collection-report-${reportDate}.csv`, [["FinTrack Collection Report"], ["Report date", reportDate], ["Accounts in report", loans.length], ["Expected collection", totalExpected], ["Total collected", total], [], ["Customer", "Expected collection", "Actual collected", "Outstanding", "Collection status", "Payment mode", "Cash amount", "UPI amount", "Collected by", "Notes/comments"], ...rows, [], ["Total", totalExpected, total]]);
};
const downloadCustomerReport = loan => {
  const monthly = loan.kind === "monthly";
  const rows = [...loan.transactions].sort((a, b) => a.date.localeCompare(b.date)).map(transaction => [transaction.date, monthly ? transaction.interestAmount || 0 : "", monthly ? transaction.principalAmount || 0 : "", monthly ? transaction.penaltyAmount || 0 : "", paymentValue(loan, transaction), paymentModeLabel(transaction), transaction.cashAmount || "", transaction.upiAmount || "", transaction.ref || "", transaction.notes || ""]);
  downloadCsv(`fintrack-payment-history-${loan.id}.csv`, [["FinTrack Customer Payment Report"], ["Customer", loan.customerName], ["Finance ID", loan.id], ["Finance type", loan.kind], [monthly ? "Principal taken" : "Amount paid to customer", monthly ? loan.principal : loan.disbursedAmount], [monthly ? "Principal remaining" : "Collection balance", loanBalance(loan)], ["Total paid", loanPaid(loan)], [], ["Date", "Interest paid", "Principal repaid", "Penalty paid", "Total paid", "Mode", "Cash amount", "UPI amount", "Reference", "Notes"], ...rows]);
};
function Login({
  loans,
  onLogin,
  adminPin
}) {
  const [role, setRole] = useState("financier"),
    [id, setId] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState("");
  const enter = () => {
    if (role === "financier") {
      if (pin === adminPin) onLogin({
        role: "financier"
      });else setError("Incorrect financier PIN.");
    } else {
      const loan = loans.find(l => l.id.toUpperCase() === id.toUpperCase() && l.pin === pin);
      loan ? onLogin({
        role: "customer",
        loanId: loan.id
      }) : setError("Check the finance ID and PIN. Demo customer PIN is 0000.");
    }
  };
  return <div className="login"><div className="brand" style={{
      textAlign: "center"
    }}>FinTrack</div><p className="sub" style={{
      textAlign: "center",
      marginBottom: 22
    }}>Daily & monthly finance collections</p><div className="card"><div className="tabs" style={{
        marginBottom: 18
      }}><Button className={`tab ${role === "financier" ? "active" : ""}`} onClick={() => setRole("financier")}>Financier</Button><Button className={`tab ${role === "customer" ? "active" : ""}`} onClick={() => setRole("customer")}>Customer</Button></div>{role === "customer" && <Field label="Finance ID"><input placeholder="e.g. M1001" value={id} onChange={e => setId(e.target.value)} /></Field>}<div className="spacer"><Field label="PIN"><input type="password" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && enter()} /></Field></div>{error && <p className="red small">{error}</p>}<Button className="primary spacer" style={{
        width: "100%"
      }} onClick={enter}>Sign in</Button><p className="small" style={{
        marginTop: 16
      }}>Demo: financier PIN 1234 · customer IDs D1001 / M1001, PIN 0000</p></div></div>;
}
function NewFinance({
  close,
  save
}) {
  const [f, setF] = useState({
    kind: "daily",
    customerName: "",
    phone: "",
    address: "",
    aadhaar: "",
    pan: "",
    startDate: today(),
    collectionAmount: "10000",
    disbursedAmount: "",
    principal: "100000",
    annualRate: "3",
    penaltyRate: "5"
  });
  const [err, setErr] = useState("");
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const submit = async () => {
    const daily = f.kind === "daily";
    if (!f.customerName || !f.phone || daily && (+f.collectionAmount <= 0 || +f.disbursedAmount <= 0) || !daily && +f.principal <= 0) return setErr(daily ? "Enter customer details, the financed amount, and the actual positive amount paid to the customer." : "Complete the customer details and amount.");
    const stamp = Date.now().toString().slice(-6),
      isDaily = f.kind === "daily";
    try {
      await save({
      ...f,
      aadhaar: f.aadhaar.trim(),
      pan: f.pan.trim().toUpperCase(),
      id: `${isDaily ? "D" : "M"}${stamp}`,
      customerId: `C${stamp}`,
      pin: "0000",
      collectionAmount: +f.collectionAmount,
      // This is the actual amount entered by the financier; never calculate a default percentage.
      disbursedAmount: isDaily ? +f.disbursedAmount : +f.disbursedAmount,
      principal: +f.principal,
      annualRate: +f.annualRate,
      penaltyRate: +f.penaltyRate,
      dailyCollection: isDaily ? dailyInstallmentAmount(f.collectionAmount) : 0,
      rateChanges: [],
      transactions: []
      });
    } catch (error) { setErr(error.message || "Could not create the finance account."); }
  };
  return <Modal close={close}><h2 className="title">New finance account</h2><p className="copy">Customer portal access is enabled automatically with a generated PIN.</p><div className="tabs spacer"><Button className={`tab ${f.kind === "daily" ? "active" : ""}`} onClick={() => set("kind", "daily")}>Daily Finance</Button><Button className={`tab ${f.kind === "monthly" ? "active" : ""}`} onClick={() => set("kind", "monthly")}>Monthly Finance</Button></div><div className="form spacer"><Field label="Customer name *"><input value={f.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone *"><input value={f.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="Start date"><input type="date" value={f.startDate} onChange={e => set("startDate", e.target.value)} /></Field><Field label="Address"><input value={f.address} onChange={e => set("address", e.target.value)} /></Field><div className="notice span"><strong>KYC details</strong> — store these only with customer consent.</div><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" placeholder="12-digit Aadhaar" value={f.aadhaar} onChange={e => set("aadhaar", e.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" placeholder="ABCDE1234F" value={f.pan} onChange={e => set("pan", e.target.value.toUpperCase())} /></Field>{f.kind === "daily" ? <><Field label="Amount financed — repaid in 100 days (₹) *"><input type="number" min="1" value={f.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><Field label="Actual paid to customer (₹) *"><input type="number" min="1" placeholder="Enter the actual amount paid" value={f.disbursedAmount} onChange={e => set("disbursedAmount", e.target.value)} /></Field><div className="notice span">Enter the actual amount paid to the customer. It is not calculated automatically and will be used in Profit &amp; Loss. The repayment schedule remains 100 days: {money(dailyInstallmentAmount(f.collectionAmount || 0))} per day.</div></> : <><Field label="Principal (₹) *"><input type="number" value={f.principal} onChange={e => set("principal", e.target.value)} /></Field><Field label="Monthly interest rate (%)"><input type="number" value={f.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Missed-interest penalty (%)"><input type="number" value={f.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field></>}</div>{err && <p className="red small">{err}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Create account</Button></div></Modal>;
}
function Payment({
  loan,
  close,
  save
}) {
  const isDaily = loan.kind === "daily";
  const [f, setF] = useState({
    date: today(),
    mode: "upi",
    ref: "",
    amount: isDaily ? String(loan.dailyCollection) : "",
    interestAmount: isDaily ? "" : String(Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100)),
    principalAmount: "",
    penaltyAmount: "",
    cashAmount: "",
    upiAmount: "",
    notes: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(x => ({
    ...x,
    [k]: v
  }));
  const total = isDaily ? Number(f.amount || 0) : Number(f.interestAmount || 0) + Number(f.principalAmount || 0) + Number(f.penaltyAmount || 0);
  const splitTotal = Number(f.cashAmount || 0) + Number(f.upiAmount || 0);
  const submit = async () => {
    if (busy) return;
    if (!(total > 0)) return setError("Enter a valid collection amount.");
    const isSplit = f.mode === "cash_upi";
    if (isSplit && (!(Number(f.cashAmount) > 0) || !(Number(f.upiAmount) > 0) || Math.abs(splitTotal - total) > 0.001)) return setError("Cash and UPI amounts must both be positive and equal the total collected.");
    setError("");
    setBusy(true);
    try { await save({
      ...f,
      id: `P${Date.now()}`,
      amount: total,
      interestAmount: Number(f.interestAmount || 0),
      principalAmount: Number(f.principalAmount || 0),
      penaltyAmount: Number(f.penaltyAmount || 0),
      cashAmount: isSplit ? Number(f.cashAmount) : f.mode === "cash" ? total : 0,
      upiAmount: isSplit ? Number(f.upiAmount) : f.mode === "upi" ? total : 0
    }); } catch (err) { setError(err?.message || "Could not save payment. Please try again."); } finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Record payment</h2><p className="copy">{loan.customerName} · Current balance {money(loanBalance(loan))}</p><div className="form spacer"><Field label="Payment date"><input type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field><Field label="Payment mode"><select value={f.mode} onChange={e => set("mode", e.target.value)}><option value="upi">UPI</option><option value="cash">Cash</option><option value="cash_upi">Cash + UPI</option><option value="bank">Bank transfer</option></select></Field>{isDaily ? <Field className="span" label="Collection amount (₹)"><input type="number" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field> : <><Field label="Interest paid (₹)"><input type="number" value={f.interestAmount} onChange={e => set("interestAmount", e.target.value)} /></Field><Field label="Principal repaid (₹)"><input type="number" value={f.principalAmount} onChange={e => set("principalAmount", e.target.value)} /></Field><Field label="Penalty paid (₹)"><input type="number" value={f.penaltyAmount} onChange={e => set("penaltyAmount", e.target.value)} /></Field><div className="card"><div className="metric-label">Total received</div><div className="metric-value green">{money((+f.interestAmount || 0) + (+f.principalAmount || 0) + (+f.penaltyAmount || 0))}</div></div></>}{f.mode === "cash_upi" && <><Field label="Cash amount (₹)"><input type="number" min="0" value={f.cashAmount} onChange={e => set("cashAmount", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" value={f.upiAmount} onChange={e => set("upiAmount", e.target.value)} /></Field><div className="card span"><div className="metric-label">Total collected</div><div className="metric-value green">{money(total)}</div><div className="small">Cash {money(f.cashAmount)} + UPI {money(f.upiAmount)} = {money(splitTotal)}</div></div></>}<Field label="UPI / bank reference"><input value={f.ref} onChange={e => set("ref", e.target.value)} /></Field><Field label="Notes"><input value={f.notes} onChange={e => set("notes", e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save payment"}</Button></div></Modal>;
}
function EditAccount({ loan, close, save }) {
  const [form, setForm] = useState({ ...loan });
  const [error, setError] = useState("");
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    try {
      const updated = { ...form, collectionAmount: +form.collectionAmount, disbursedAmount: form.kind === "daily" ? +form.disbursedAmount : 0, dailyCollection: form.kind === "daily" ? dailyInstallmentAmount(form.collectionAmount) : 0, principal: +form.principal, annualRate: +form.annualRate, penaltyRate: +form.penaltyRate };
      await save(updated); close();
    } catch (err) { setError(err.message || "Could not update the account."); }
  };
  return <Modal><h2 className="title">Edit finance account</h2><p className="copy">Correct the plan type or any account detail. Changes are recorded in the audit log.</p><div className="tabs spacer"><Button className={`tab ${form.kind === "daily" ? "active" : ""}`} onClick={() => set("kind", "daily")}>Daily Finance</Button><Button className={`tab ${form.kind === "monthly" ? "active" : ""}`} onClick={() => set("kind", "monthly")}>Monthly Finance</Button></div><div className="form spacer"><Field label="Customer name"><input value={form.customerName} onChange={e => set("customerName", e.target.value)} /></Field><Field label="Phone"><input value={form.phone} onChange={e => set("phone", e.target.value)} /></Field><Field label="Collection start date"><input type="date" value={form.startDate} disabled /></Field><Field label="Address"><input value={form.address} onChange={e => set("address", e.target.value)} /></Field>{form.kind === "daily" ? <><Field label="100-day repayment amount (₹)"><input type="number" value={form.collectionAmount} onChange={e => set("collectionAmount", e.target.value)} /></Field><Field label="Paid to customer (₹)"><input type="number" min="0" value={form.disbursedAmount} onChange={e => set("disbursedAmount", e.target.value)} /></Field><div className="notice span">Paid to customer is editable for corrections. Profit, loss and outstanding figures update automatically from the saved value.</div></> : <><Field label="Principal (₹)"><input type="number" value={form.principal} onChange={e => set("principal", e.target.value)} /></Field><Field label="Monthly interest rate (%)"><input type="number" value={form.annualRate} onChange={e => set("annualRate", e.target.value)} /></Field><Field label="Penalty rate (%)"><input type="number" value={form.penaltyRate} onChange={e => set("penaltyRate", e.target.value)} /></Field></>}</div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save changes</Button></div></Modal>;
}
const Modal = ({
  children
}) => <div className="modal-bg"><div className="modal">{children}</div></div>;
function CustomerPortalSetup({ loan, close, save }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdPortalId, setCreatedPortalId] = useState("");
  const submit = async () => {
    if (!/^\d{6,}$/.test(pin)) return setError("Use a PIN with at least 6 digits.");
    if (pin !== confirm) return setError("The two PINs do not match.");
    setBusy(true); setError("");
    try {
      const portalId = await save(loan, pin);
      if (portalId) { setCreatedPortalId(portalId); setPin(""); setConfirm(""); }
      else close();
    }
    catch (err) { setError(err.message || "Could not save the customer portal PIN."); }
    finally { setBusy(false); }
  };
  const portalId = createdPortalId || loan.portalId;
  return <Modal><h2 className="title">Customer portal</h2>{portalId ? <><p className="copy">Portal ID: <strong className="gold">{portalId}</strong></p><p className="notice">Give this portal ID and the PIN to {loan.customerName} privately. They can use Customer login from the FinTrack sign-in page.</p>{createdPortalId ? <div className="row spacer"><span className="small">Portal enabled successfully.</span><Button className="primary" onClick={close}>Done</Button></div> : <><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Reset PIN"}</Button></div></>}</> : <><p className="copy">Enable private dashboard access for {loan.customerName}.</p><p className="notice">Choose a unique PIN and share it privately with the customer. FinTrack will create a portal ID for this account.</p><div className="tool-stack spacer"><Field label="New customer PIN"><input type="password" inputMode="numeric" minLength="6" value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} /></Field><Field label="Confirm customer PIN"><input type="password" inputMode="numeric" minLength="6" value={confirm} onChange={event => setConfirm(event.target.value.replace(/\D/g, ""))} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Enable customer portal"}</Button></div></>}</Modal>;
}
function NewAccountPortalNotice({ customerName, portalId, pin, close }) {
  return <Modal><h2 className="title">Customer portal enabled</h2><p className="copy">{customerName} can sign in from the FinTrack login page using Customer login.</p><div className="grid metrics spacer"><Metric label="Portal ID" value={portalId} color="gold" /><Metric label="PIN" value={pin} color="blue" /></div><p className="notice">Share the portal ID and PIN with the customer privately. You can reset the PIN anytime from the customer account page.</p><div className="row spacer"><Button className="primary" onClick={close}>Done</Button></div></Modal>;
}
function KycDetails({ loan, kyc, edit }) {
  return <div className="card spacer"><div className="toolbar"><div><strong>KYC details</strong><p className="small">Visible only to your financier workspace.</p></div><Button onClick={() => edit(loan)}>Edit KYC</Button></div><div className="grid metrics"><Metric label="Aadhaar number" value={kyc?.aadhaar || "Not added"} color={kyc?.aadhaar ? "gold" : ""} /><Metric label="PAN number" value={kyc?.pan || "Not added"} color={kyc?.pan ? "gold" : ""} /></div></div>;
}
function KycEditor({ loan, current, close, save }) {
  const [aadhaar, setAadhaar] = useState(current?.aadhaar || "");
  const [pan, setPan] = useState(current?.pan || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError("");
    try { await save(loan, aadhaar, pan); close(); }
    catch (err) { setError(err.message || "Could not save KYC details."); }
    finally { setBusy(false); }
  };
  return <Modal><h2 className="title">KYC details</h2><p className="notice">These details are encrypted in the database and are never shown to customers.</p><div className="form spacer"><Field label="Aadhaar number"><input inputMode="numeric" maxLength="12" value={aadhaar} onChange={event => setAadhaar(event.target.value.replace(/\D/g, ""))} /></Field><Field label="PAN number"><input maxLength="10" value={pan} onChange={event => setPan(event.target.value.toUpperCase())} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save KYC"}</Button></div></Modal>;
}
function FinanceDetail({
  loan,
  back,
  collect,
  addRate,
  edit,
  remove,
  portal,
  kyc,
  editKyc
}) {
  const monthly = loan.kind === "monthly",
    [rate, setRate] = useState({
      effectiveDate: today(),
      annualRate: ""
    });
  const paymentRows = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date));
  return <><div className="toolbar"><div><Button onClick={back}>← Back</Button><h1 className="title spacer">{loan.customerName}</h1><p className="copy">{loan.phone} · {loan.address || "Address not added"}</p></div><div className="tabs"><Button onClick={() => portal(loan)}>Customer portal</Button><Button onClick={() => edit(loan)}>Edit account</Button><Button className="danger" onClick={() => remove(loan)}>Delete account</Button><Button className="primary" onClick={() => collect(loan)}>+ Record payment</Button></div></div><KycDetails loan={loan} kyc={kyc} edit={editKyc} /><div className="grid metrics"><Metric label={monthly ? "Principal financed" : "Customer repays"} value={money(monthly ? loan.principal : loan.collectionAmount)} color="gold" /><Metric label={monthly ? "Principal balance" : "Paid to customer"} value={money(monthly ? monthlyBalance(loan) : loan.disbursedAmount)} color="red" /><Metric label="Total received" value={money(loanPaid(loan))} color="green" />{monthly ? <><Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /><Metric label="Estimated penalty" value={money(estimatedPenalty(loan))} color="red" /></> : <Metric label="Daily collection" value={`${money(loan.dailyCollection)} × 100 days`} color="blue" />}</div>{monthly && <div className="grid two"><div className="card"><strong>Monthly interest status</strong><div className="table spacer"><table><thead><tr><th>Month</th><th>Due date</th><th>Principal at due date</th><th>Rate</th><th>Interest due</th></tr></thead><tbody>{monthlyDueRows(loan).map(r => <tr key={r.number}><td>{r.number}</td><td>{r.dueDate}</td><td>{money(r.balance)}</td><td>{r.annualRate}%</td><td>{money(r.interest)}</td></tr>)}</tbody></table></div><div className="notice">Interest due {money(monthlyInterestDue(loan))} · Interest received {money(monthlyInterestPaid(loan))} · Missed months {missedMonths(loan)}. Penalty shown is an estimate using your configured rate.</div></div><div className="card"><strong>Change monthly interest rate</strong><p className="small">This applies to interest due from the selected date onward.</p><div className="spacer"><Field label="Effective date"><input type="date" min={loan.startDate} value={rate.effectiveDate} onChange={e => setRate({
              ...rate,
              effectiveDate: e.target.value
            })} /></Field></div><div className="spacer"><Field label="New monthly rate (%)"><input type="number" min="0" step=".01" value={rate.annualRate} onChange={e => setRate({
              ...rate,
              annualRate: e.target.value
            })} /></Field></div><Button className="primary spacer" onClick={() => rate.annualRate !== "" && (addRate(loan, {
          ...rate,
          annualRate: +rate.annualRate
        }), setRate({
          ...rate,
          annualRate: ""
        }))}>Save rate change</Button><div className="spacer"><strong>Rate history</strong>{[{
            effectiveDate: loan.startDate,
            annualRate: loan.annualRate
          }, ...loan.rateChanges].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((r, i) => <div className="row small" key={i} style={{
            padding: "8px 0",
            borderBottom: `1px solid ${C.line}`
          }}><span>From {r.effectiveDate}</span><span className="gold">{r.annualRate}% monthly</span></div>)}</div></div></div>}<div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th>{monthly && <><th>Interest</th><th>Principal</th><th>Penalty</th></>}<th>Total</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{paymentRows.map(t => <tr key={t.id}><td>{t.date}</td>{monthly && <><td>{money(t.interestAmount)}</td><td>{money(t.principalAmount)}</td><td>{money(t.penaltyAmount)}</td></>}<td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{paymentModeLabel(t)}</td><td>{t.ref || "—"}</td></tr>)}</tbody></table></div></div></>;
}
function PaymentNoteEditor({ transaction, close, save }) {
  const [notes, setNotes] = useState(transaction.notes || "");
  const [error, setError] = useState("");
  const submit = async () => { try { await save(transaction, notes); close(); } catch (e) { setError(e.message || "Could not save notes."); } };
  return <Modal><h2 className="title">Edit payment notes</h2><Field className="spacer" label="Notes / comments"><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add a collection note" /></Field>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={submit}>Save notes</Button></div></Modal>;
}
function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, busy = false, error = "", close, onConfirm }) {
  return <Modal><h2 className="title">{title}</h2><p className="copy">{message}</p>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className={danger ? "danger primary" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</Button></div></Modal>;
}
function PaymentCorrectionEditor({ loan, transaction, close, save }) {
  const isDaily = loan.kind === "daily";
  const isSplit = transaction.mode === "cash_upi";
  const [f, setF] = useState({
    amount: String(transaction.amount ?? ""),
    interestAmount: String(transaction.interestAmount ?? 0),
    principalAmount: String(transaction.principalAmount ?? 0),
    penaltyAmount: String(transaction.penaltyAmount ?? 0),
    cashAmount: String(transaction.cashAmount ?? 0),
    upiAmount: String(transaction.upiAmount ?? 0),
    notes: transaction.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setF(current => ({ ...current, [key]: value }));
  const total = isDaily ? Number(f.amount || 0) : Number(f.interestAmount || 0) + Number(f.principalAmount || 0) + Number(f.penaltyAmount || 0);
  const splitTotal = Number(f.cashAmount || 0) + Number(f.upiAmount || 0);
  const submit = async () => {
    if (!(total > 0)) return setError("Enter a valid collection amount.");
    if (isSplit && (!(Number(f.cashAmount) > 0) || !(Number(f.upiAmount) > 0) || Math.abs(splitTotal - total) > 0.001)) {
      return setError("Cash and UPI amounts must both be positive and equal the total collected.");
    }
    setBusy(true); setError("");
    try {
      await save({
        ...transaction,
        amount: total,
        interestAmount: Number(f.interestAmount || 0),
        principalAmount: Number(f.principalAmount || 0),
        penaltyAmount: Number(f.penaltyAmount || 0),
        cashAmount: isSplit ? Number(f.cashAmount) : transaction.mode === "cash" ? total : 0,
        upiAmount: isSplit ? Number(f.upiAmount) : transaction.mode === "upi" ? total : 0,
        notes: f.notes,
      });
      close();
    } catch (err) {
      setError(err?.message || "Could not update this payment.");
    } finally {
      setBusy(false);
    }
  };
  return <Modal close={close}><h2 className="title">Edit payment</h2><p className="copy">{loan.customerName} · {transaction.date} · {paymentModeLabel(transaction)}</p><div className="form spacer">{isDaily ? <Field className="span" label="Collection amount (₹)"><input type="number" min="0.01" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} /></Field> : <><Field label="Interest paid (₹)"><input type="number" min="0" step="0.01" value={f.interestAmount} onChange={e => set("interestAmount", e.target.value)} /></Field><Field label="Principal repaid (₹)"><input type="number" min="0" step="0.01" value={f.principalAmount} onChange={e => set("principalAmount", e.target.value)} /></Field><Field label="Penalty paid (₹)"><input type="number" min="0" step="0.01" value={f.penaltyAmount} onChange={e => set("penaltyAmount", e.target.value)} /></Field><div className="card span"><div className="metric-label">Total received</div><div className="metric-value green">{money(total)}</div></div></>}{isSplit && <><Field label="Cash amount (₹)"><input type="number" min="0" step="0.01" value={f.cashAmount} onChange={e => set("cashAmount", e.target.value)} /></Field><Field label="UPI amount (₹)"><input type="number" min="0" step="0.01" value={f.upiAmount} onChange={e => set("upiAmount", e.target.value)} /></Field><div className="card span"><div className="small">Cash {money(f.cashAmount)} + UPI {money(f.upiAmount)} = {money(splitTotal)}</div></div></>}<Field className="span" label="Notes / comments"><input value={f.notes} onChange={e => set("notes", e.target.value)} placeholder="Add a collection note" /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save changes"}</Button></div></Modal>;
}
function AccountStatusModal({ loan, status, close, save }) {
  const isClosing = status === "closed";
  const isBankrupt = status === "bankrupt";
  const requiresNote = isClosing || isBankrupt;
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = isBankrupt ? "Mark account bankrupt" : isClosing ? "Close account" : "Reopen account";
  const description = isBankrupt
    ? "The outstanding balance will be recorded as a loss. Add a reason for your records."
    : isClosing
      ? "Close only after full repayment. New collections will be disabled."
      : "This account will become active again and collections can resume.";
  const submit = async () => {
    if (requiresNote && !note.trim()) return setError("A note is required.");
    setBusy(true); setError("");
    try {
      await save(loan, status, requiresNote ? note.trim() : "Account reopened by financier");
      close();
    } catch (err) {
      setError(err?.message || "Could not update account status.");
    } finally {
      setBusy(false);
    }
  };
  return <Modal close={close}><h2 className="title">{title}</h2><p className="copy">{loan.customerName} · {description}</p>{requiresNote && <Field className="spacer" label={isBankrupt ? "Bankruptcy reason" : "Closure note"}><textarea rows={4} value={note} onChange={event => setNote(event.target.value)} placeholder={isBankrupt ? "Why is this account being marked bankrupt?" : "Confirm full repayment before closing."} /></Field>}{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className={isBankrupt ? "danger primary" : "primary"} disabled={busy} onClick={submit}>{busy ? "Saving…" : title}</Button></div></Modal>;
}
function ProfitLoss({ loan }) {
  const outstanding = loan.status === "bankrupt" ? 0 : loanBalance(loan);
  return <div className="card spacer"><strong>Profit &amp; loss</strong><p className="small">Live position based on collections, payout/principal and account status.</p><div className="grid metrics"><Metric label="Paid / invested" value={money(investedAmount(loan))} color="gold" /><Metric label="Total collected" value={money(loanPaid(loan))} color="green" /><Metric label="Outstanding" value={money(outstanding)} color="red" /><Metric label="Realized profit" value={money(realizedProfit(loan))} color="green" /><Metric label="Loss" value={money(realizedLoss(loan))} color={realizedLoss(loan) ? "red" : ""} /><Metric label="Net cash position" value={money(netPosition(loan))} color={netPosition(loan) < 0 ? "red" : "green"} /></div>{loan.status === "bankrupt" && <p className="notice"><strong>BANKRUPT</strong> · Capital loss {money(realizedLoss(loan))} · Recorded {loan.statusChangedAt ? new Date(loan.statusChangedAt).toLocaleDateString("en-IN") : "—"}<br /><strong>Bankruptcy reason:</strong> {loan.statusNote || "No reason recorded."}</p>}{loan.status === "closed" && <p className="notice"><strong>Closed account</strong> · {loan.statusNote || "No closure note recorded."}</p>}</div>;
}
function OperationsDetail({ loan, relatedLoans = [], back, collect, edit, remove, portal, kyc, editKyc, isOwner, changeStatus, editPaymentNote, correctPayment, deletePayment, orgSettings, authToken, workspace, onLogReceipt, reminderLog = [], onStatement }) {
  const monthly = loan.kind === "monthly";
  const upcoming = monthly ? buildMonthlyUpcoming([loan])[0] : null;
  const [noteTransaction, setNoteTransaction] = useState(null);
  const [correctTransaction, setCorrectTransaction] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState(null);
  const [confirmRemoveAccount, setConfirmRemoveAccount] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const paymentRows = [...loan.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const disabled = loan.status === "bankrupt" || loan.status === "closed";
  const removeAccount = async () => {
    setDialogBusy(true); setDialogError("");
    try { await remove(loan); setConfirmRemoveAccount(false); }
    catch (error) { setDialogError(error?.message || "Could not delete this account."); }
    finally { setDialogBusy(false); }
  };
  const removePaymentRow = async () => {
    setDialogBusy(true); setDialogError("");
    try { await deletePayment(deletePaymentTarget); setDeletePaymentTarget(null); }
    catch (error) { setDialogError(error?.message || "Could not delete this payment."); }
    finally { setDialogBusy(false); }
  };
  return <><div className="toolbar"><div><Button onClick={back}>← Back</Button><h1 className="title spacer">{loan.customerName}</h1><p className="copy"><a className="phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a> · {loan.address || "Address not added"}</p><p className="small spacer">Collection start date: <strong>{loan.startDate}</strong> · Status: <Badge status={loanStatus(loan)} />{accountOutcome(loan) && <> · {accountOutcome(loan).label} date: <strong>{accountOutcome(loan).date || "Not recorded"}</strong>{accountOutcome(loan).days ? ` · ${accountOutcome(loan).label} in ${accountOutcome(loan).days} days` : ""}</>}{isOwner && <> · User ID: <strong>{loan.portalId || "Not enabled"}</strong></>}</p></div><div className="tabs"><Button onClick={() => onStatement?.(loan)}>Customer Statement</Button>{isOwner && <><Button onClick={() => portal(loan)}>{loan.portalId ? "Reset PIN" : "Enable customer portal"}</Button><Button onClick={() => edit(loan)}>Edit account</Button><Button className="danger" onClick={() => { setDialogError(""); setConfirmRemoveAccount(true); }}>Delete account</Button><Button className="danger" onClick={() => setStatusChange("bankrupt")}>Mark bankrupt</Button><Button onClick={() => setStatusChange(loan.status === "active" ? "closed" : "active")}>{loan.status === "active" ? "Close account" : "Reopen account"}</Button></>}{!disabled && <Button className="primary" disabled={collectedOn(loan)} onClick={() => !collectedOn(loan) && collect(loan)}>{collectedOn(loan) ? "Collected today" : "+ Record payment"}</Button>}</div></div>{isOwner && <KycDetails loan={loan} kyc={kyc} edit={editKyc} />}{isOwner && <div className="grid metrics"><Metric label="User ID" value={loan.portalId || "Not enabled"} color={loan.portalId ? "gold" : ""} /></div>}{isOwner && loan.portalId && <p className="notice">Share this User ID with the customer. Use Reset PIN to set the PIN they will use on Customer login, then share both privately.</p>}<div className="grid metrics"><Metric label={monthly ? "Principal financed" : "Customer repays"} value={money(monthly ? loan.principal : loan.collectionAmount)} color="gold" /><Metric label={monthly ? "Principal balance" : "Paid to customer"} value={money(monthly ? monthlyBalance(loan) : loan.disbursedAmount)} color="red" /><Metric label="Total received" value={money(loanPaid(loan))} color="green" />{monthly ? <Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /> : <Metric label="Daily collection" value={`${money(loan.dailyCollection)} × 100 days`} color="blue" />}</div>{isOwner && <CreditScoreCard loans={relatedLoans.length ? relatedLoans : [loan]} focusLoanId={loan.id} accountLabel={monthly ? "monthly" : "daily"} />}{loan.kind === "daily" && loanStatus(loan) === "active" && <div className="card spacer"><strong>Repayment progress</strong><div className="metric-value gold">{`Day ${dailyProgress(loan).completed} of 100`}</div><p className="small">Start date: {loan.startDate} · Days Completed: {dailyProgress(loan).completed} · Days Remaining: {dailyProgress(loan).remaining}</p><div style={{height:8,borderRadius:999,background:C.surface,overflow:"hidden"}}><div style={{height:"100%",width:`${dailyProgress(loan).completed}%`,background:C.gold}} /></div></div>}{isOwner && <ProfitLoss loan={loan} />}{upcoming && <UpcomingPaymentCard item={upcoming} settings={orgSettings} token={authToken} reminderLog={reminderLog} onReminderSent={() => {}} />}<div className="card spacer"><strong>Payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th>{monthly && <><th>Interest</th><th>Principal</th><th>Penalty</th></>}<th>Total</th><th>Mode</th><th>Reference</th><th>Notes / comments</th><th>Collected by</th><th>Receipt</th>{isOwner && <th></th>}</tr></thead><tbody>{paymentRows.map(t => <tr key={t.id}><td>{t.date}</td>{monthly && <><td>{money(t.interestAmount)}</td><td>{money(t.principalAmount)}</td><td>{money(t.penaltyAmount)}</td></>}<td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{paymentModeLabel(t)}</td><td>{t.ref || "—"}</td><td>{t.notes || "—"}</td><td>{t.collectorName || "Financier/Admin"}</td><td>{t.receiptNumber ? <ReceiptActions compact receipt={buildFinanceReceipt({ loan, transaction: t, settings: orgSettings, workspace })} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} /> : "—"}</td>{isOwner && <td><Button onClick={() => setNoteTransaction(t)}>Edit note</Button><Button onClick={() => setCorrectTransaction(t)}>Edit payment</Button><Button className="danger" onClick={() => { setDialogError(""); setDeletePaymentTarget(t); }}>Delete</Button></td>}</tr>)}</tbody></table></div></div>{noteTransaction && <PaymentNoteEditor transaction={noteTransaction} close={() => setNoteTransaction(null)} save={editPaymentNote} />}{correctTransaction && <PaymentCorrectionEditor loan={loan} transaction={correctTransaction} close={() => setCorrectTransaction(null)} save={correctPayment} />}{statusChange && <AccountStatusModal loan={loan} status={statusChange} close={() => setStatusChange(null)} save={changeStatus} />}{confirmRemoveAccount && <ConfirmDialog title="Delete finance account?" message={`Delete ${loan.customerName}'s finance account and all its payments? This cannot be undone.`} confirmLabel="Delete account" danger busy={dialogBusy} error={dialogError} close={() => { if (!dialogBusy) { setConfirmRemoveAccount(false); setDialogError(""); } }} onConfirm={removeAccount} />}{deletePaymentTarget && <ConfirmDialog title="Delete payment?" message="Delete this payment permanently? This cannot be undone." confirmLabel="Delete payment" danger busy={dialogBusy} error={dialogError} close={() => { if (!dialogBusy) { setDeletePaymentTarget(null); setDialogError(""); } }} onConfirm={removePaymentRow} />}</>;
}
function DashboardDragHandle({ index, customerName, loanId, startTouchDrag, moveTouchDrag, finishTouchDrag, cancelTouchDrag }) {
  return <td
    className="small route-handle dashboard-drag-handle"
    title={`Drag to reorder ${customerName}`}
    aria-label={`Drag to reorder ${customerName}`}
    onTouchStart={event => startTouchDrag?.(event, loanId)}
    onTouchMove={moveTouchDrag}
    onTouchEnd={finishTouchDrag}
    onTouchCancel={cancelTouchDrag}
  >↕ {index}</td>;
}
function TodayCollectionRouteTable({
  rows,
  sectionKind,
  paidToday,
  canReorder,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
  collect,
  view,
}) {
  const monthly = sectionKind === "monthly";
  const dueLabel = monthly ? "Interest due" : "Daily due";
  const beginDrag = (event, loanId) => {
    if (!canReorder) return;
    if (event.target.closest("a,button")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", loanId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setDraggedId(loanId);
  };
  if (!rows.length) {
    return <div className="card">No matching {monthly ? "monthly" : "daily"}-finance customers.</div>;
  }
  return <div className={`table dashboard-finance-table collection-route-table${canReorder ? " can-reorder" : ""}`}>
    <table>
      <thead>
        <tr>
          {canReorder && <th>Order</th>}
          <th>Customer</th>
          <th>{dueLabel}</th>
          <th>Balance</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((loan, index) => {
          const paid = paidToday(loan);
          const due = monthly
            ? Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100)
            : loan.dailyCollection;
          const balance = monthly ? monthlyBalance(loan) : dailyBalance(loan);
          return <tr
            key={loan.id}
            data-account-id={loan.id}
            className={`${draggedId === loan.id ? "route-row-dragging" : ""}${paid ? " collection-row-collected" : ""}`}
            draggable={canReorder}
            aria-grabbed={canReorder ? draggedId === loan.id : undefined}
            onDragStart={event => beginDrag(event, loan.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={event => canReorder && event.preventDefault()}
            onDrop={event => {
              if (!canReorder) return;
              event.preventDefault();
              onReorder?.(loan.id);
            }}
          >
            {canReorder && <DashboardDragHandle
              index={index + 1}
              customerName={loan.customerName}
              loanId={loan.id}
              startTouchDrag={startTouchDrag}
              moveTouchDrag={moveTouchDrag}
              finishTouchDrag={finishTouchDrag}
              cancelTouchDrag={cancelTouchDrag}
            />}
            <td data-label="Customer"><strong>{loan.customerName}</strong><br /><a className="small phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a></td>
            <td className={paid ? "green" : "gold"} data-label={dueLabel}>{paid ? "✓ Paid" : money(due)}</td>
            <td className="red" data-label="Balance">{money(balance)}</td>
            <td data-label="Status">{paid ? "Collected" : "Pending"}</td>
            <td><Button onClick={() => view(loan)}>Details</Button>{!paid && loan.status === "active" && <Button className="primary" onClick={() => collect(loan)}>Collect</Button>}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
function TodayCollections({
  loans,
  kind,
  back,
  collect,
  view,
  canReorder = false,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
}) {
  const [search, setSearch] = useState("");
  const activeLoans = loans.filter(loan => loan.status === "active" && loanBalance(loan) > 0);
  const dailyLoans = activeLoans.filter(loan => loan.kind === "daily");
  const monthlyLoans = activeLoans.filter(loan => loan.kind === "monthly");
  const paidToday = loan => loan.transactions.some(transaction => transaction.date === today());
  const collectedToday = activeLoans.filter(paidToday).length;
  const expectedToday = dailyLoans.reduce((sum, loan) => sum + loan.dailyCollection, 0) + monthlyLoans.reduce((sum, loan) => sum + Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100), 0);
  const receivedToday = activeLoans.reduce((sum, loan) => sum + loan.transactions.filter(transaction => transaction.date === today()).reduce((total, transaction) => total + paymentValue(loan, transaction), 0), 0);
  const matchesSearch = loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const shownDailyLoans = dailyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const shownMonthlyLoans = monthlyLoans.filter(matchesSearch).sort(byCollectionOrderThenName);
  const routeTableProps = {
    paidToday,
    canReorder,
    draggedId,
    setDraggedId,
    onReorder,
    startTouchDrag,
    moveTouchDrag,
    finishTouchDrag,
    cancelTouchDrag,
    collect,
    view,
  };
  useEffect(() => {
    const sections = document.querySelectorAll(".collection-shell .collection-section");
    const unrelatedSection = kind === "daily" ? sections[1] : sections[0];
    if (unrelatedSection) unrelatedSection.hidden = true;
    return () => {
      if (unrelatedSection) unrelatedSection.hidden = false;
    };
  }, [kind]);
  return <main className="shell collection-shell"><header className="top"><div><Button onClick={back}>← Dashboard</Button><h1 className="title spacer">Today’s collections</h1><p className="copy">{today()} · Daily collection and monthly-interest accounts.</p></div></header><div className="collection-search"><input aria-label="Search customer" placeholder="Search by customer name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="collection-summary"><div><span>Collected today</span><strong>{collectedToday} / {activeLoans.length}</strong></div><div><span>Received today</span><strong className="green">{money(receivedToday)}</strong></div><div><span>Daily + monthly due</span><strong className="gold">{money(expectedToday)}</strong></div></div>{canReorder && (shownDailyLoans.length > 1 || shownMonthlyLoans.length > 1) && <p className="small dashboard-reorder-hint">Drag the handle to save your {kind} collection order. It is restored after refresh and sign-in.</p>}<div className="collection-section"><h2>Daily finance <span>{shownDailyLoans.length} shown</span></h2><TodayCollectionRouteTable rows={shownDailyLoans} sectionKind="daily" {...routeTableProps} /></div><div className="collection-section"><h2>Monthly finance <span>{shownMonthlyLoans.length} shown</span></h2><p className="copy">Monthly cards show interest due on the current outstanding principal.</p><TodayCollectionRouteTable rows={shownMonthlyLoans} sectionKind="monthly" {...routeTableProps} /></div></main>;
}
function Financier({
  loans,
  businessName,
  logout,
  setLoans,
  onCreateLoan,
  onRecordPayment,
  onUpdateLoan,
  onDeleteLoan,
  onSaveCustomerPortal,
  onLoadKyc,
  onSaveKyc, activeChitSchemes = []
  , role = "staff", onStatusChange, onPaymentNoteChange, onPaymentCorrect, onPaymentDelete, onCollectionOrderChange,
  authToken, orgSettings = {}, workspace = {}, onLogReceipt, module = "all", onModuleChange = () => {},
}) {
  const [modal, setModal] = useState(null),
    [detail, setDetail] = useState(null),
    [editLoan, setEditLoan] = useState(null),
    [portalLoan, setPortalLoan] = useState(null),
    [collectionMode, setCollectionMode] = useState(false),
    [editKycLoan, setEditKycLoan] = useState(null),
    [kyc, setKyc] = useState(null),
    [filter, setFilter] = useState("all"),
    [customerMode, setCustomerMode] = useState(false),
    [statusFilter, setStatusFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [reportDate, setReportDate] = useState(today()),
    [newAccountPortal, setNewAccountPortal] = useState(null);
  const [receiptSuccess, setReceiptSuccess] = useState(null);
  const [reminderLogState, setReminderLogState] = useState([]);
  const [statementLoan, setStatementLoan] = useState(null);
  const isOwner = role === "owner";
  useEffect(() => {
    if (!authToken) return;
    loadPaymentReminderLog(authToken).then(setReminderLogState).catch(() => setReminderLogState([]));
  }, [authToken, loans]);
  const createAccount = async loan => {
    const result = await onCreateLoan(loan);
    setModal(null);
    if (result?.portalId && result?.pin) {
      setNewAccountPortal({ customerName: loan.customerName, portalId: result.portalId, pin: result.pin });
    }
  };
  const portalNotice = newAccountPortal && <NewAccountPortalNotice customerName={newAccountPortal.customerName} portalId={newAccountPortal.portalId} pin={newAccountPortal.pin} close={() => setNewAccountPortal(null)} />;
  const [draggedId, setDraggedId] = useState(null);
  const touchTargetId = useRef(null);
  const activeLoans = loans.filter(loan => ["active", "overdue"].includes(loanStatus(loan)));
  useEffect(() => {
    const navigate = event => {
      const { kind = "all", customers = false } = event.detail || {};
      onModuleChange(kind);
      if (kind === "all") {
        setFilter("all");
        setCustomerMode(false);
        setStatusFilter("all");
        return;
      }
      setFilter(customers ? "all" : kind);
      setCustomerMode(customers);
      setStatusFilter("all");
      setSearch("");
      setDetail(null);
      setCollectionMode(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("fintrack-navigate-module", navigate);
    return () => window.removeEventListener("fintrack-navigate-module", navigate);
  }, [onModuleChange]);
  const returnToDashboard = () => {
    window.dispatchEvent(new CustomEvent("fintrack-navigate-module", { detail: { kind: "all" } }));
  };
  const openCustomerDirectory = () => {
    setFilter("all");
    setCustomerMode(true);
    setStatusFilter("all");
    setSearch("");
    setDetail(null);
    setCollectionMode(false);
    window.dispatchEvent(new CustomEvent("fintrack-open-customers"));
  };
  const dedicatedModule = !customerMode && (module === "daily" || module === "monthly");
  const customerPool = customerMode
    ? loans.filter(loan => (statusFilter === "all" || loanStatus(loan) === statusFilter) && (module === "all" || loan.kind === module))
    : activeLoans.filter(loan => module === "all" || loan.kind === module);
  const shown = (filter === "all" ? customerPool : customerPool.filter(l => l.kind === filter)).filter(loan => `${loan.customerName} ${loan.phone} ${loan.address || ""}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.collectionOrder - b.collectionOrder);
  const reorder = async targetId => {
    if (!isOwner || !draggedId || draggedId === targetId) return;
    const ordered = [...loans].sort((a, b) => a.collectionOrder - b.collectionOrder);
    const from = ordered.findIndex(l => l.id === draggedId), to = ordered.findIndex(l => l.id === targetId);
    const [moved] = ordered.splice(from, 1); ordered.splice(to, 0, moved);
    setDraggedId(null); await onCollectionOrderChange(ordered.map(l => l.id));
  };
  const startTouchDrag = (event, accountId) => {
    if (!isOwner) return;
    touchTargetId.current = accountId;
    setDraggedId(accountId);
  };
  const moveTouchDrag = event => {
    if (!touchTargetId.current) return;
    const touch = event.touches?.[0];
    const target = touch && document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-account-id]");
    if (target) {
      touchTargetId.current = target.dataset.accountId;
      event.preventDefault();
    }
  };
  const finishTouchDrag = async () => {
    const targetId = touchTargetId.current;
    touchTargetId.current = null;
    if (!targetId) { setDraggedId(null); return; }
    if (!customerMode && (module === "all" || collectionMode)) {
      const kind = module === "all" ? loans.find(loan => loan.id === targetId)?.kind : module;
      if (kind) await reorderDashboard(kind, targetId);
      else setDraggedId(null);
      return;
    }
    await reorder(targetId);
  };
  const reorderDashboard = async (kind, targetId) => {
    if (!isOwner || !draggedId || draggedId === targetId) { setDraggedId(null); return; }
    const source = loans.find(loan => loan.id === draggedId);
    const target = loans.find(loan => loan.id === targetId);
    if (!source || !target || source.kind !== kind || target.kind !== kind) { setDraggedId(null); return; }
    const moving = loans.filter(loan => loan.kind === kind && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    const nextMoving = reorderIds(moving.map(loan => loan.id), draggedId, targetId);
    setDraggedId(null);
    await onCollectionOrderChange(mergeAccountOrder(loans, nextMoving, nextMoving));
  };
  const moduleLoans = module === "all" ? loans : loans.filter(loan => loan.kind === module);
  const total = moduleLoans.reduce((s, l) => s + (l.kind === "daily" ? l.collectionAmount : l.principal), 0);
  const addPayment = async t => {
    const loan = modal;
    const result = await onRecordPayment(loan, t);
    setModal(null);
    const transaction = result?.transaction;
    if (transaction?.receiptNumber) {
      const loanForReceipt = { ...loan, transactions: [...loan.transactions.filter(item => item.id !== transaction.id), transaction] };
      setReceiptSuccess(buildFinanceReceipt({ loan: loanForReceipt, transaction, settings: orgSettings, workspace }));
    }
  };
  useEffect(() => {
    if (!detail) { setKyc(null); return; }
    onLoadKyc(detail).then(setKyc).catch(() => setKyc(null));
  }, [detail?.id]);
  useEffect(() => {
    if (!detail) return;
    if (!loans.some(loan => loan.id === detail.id)) setDetail(null);
  }, [detail, loans]);
  if (collectionMode) return <><TodayCollections loans={loans.filter(loan => loan.kind === module)} kind={module} back={() => setCollectionMode(false)} collect={setModal} view={loan => { setDetail(loan); setCollectionMode(false); }} canReorder={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={targetId => reorderDashboard(module, targetId)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</>;
  if (detail) {
    const loan = loans.find(l => l.id === detail.id);
    if (!loan) return null;
    if (statementLoan) {
      return <CustomerStatementPage mode="finance" loans={loans} focusLoan={statementLoan} settings={orgSettings} back={() => setStatementLoan(null)} />;
    }
    return <main className="shell"><OperationsDetail loan={loan} relatedLoans={loans.filter(item => item.customerId && item.customerId === loan.customerId)} back={() => setDetail(null)} collect={setModal} edit={setEditLoan} remove={async account => { await onDeleteLoan(account); setDetail(null); }} portal={setPortalLoan} kyc={kyc} editKyc={setEditKycLoan} isOwner={isOwner} changeStatus={onStatusChange} editPaymentNote={onPaymentNoteChange} correctPayment={onPaymentCorrect} deletePayment={onPaymentDelete} orgSettings={orgSettings} authToken={authToken} workspace={workspace} onLogReceipt={onLogReceipt} reminderLog={reminderLogState} onStatement={setStatementLoan} />{modal && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{isOwner && editLoan && <EditAccount loan={loan} close={() => setEditLoan(null)} save={onUpdateLoan} />}{isOwner && portalLoan && <CustomerPortalSetup loan={loan} close={() => setPortalLoan(null)} save={onSaveCustomerPortal} />}{isOwner && editKycLoan && <KycEditor loan={loan} current={kyc} close={() => setEditKycLoan(null)} save={async (account, aadhaar, pan) => { await onSaveKyc(account, aadhaar, pan); setKyc(await onLoadKyc(account)); }} />}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</main>;
  }
  if (!customerMode && module === "all") {
    const dailyCustomers = loans.filter(loan => loan.kind === "daily" && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    const monthlyCustomers = loans.filter(loan => loan.kind === "monthly" && loanStatus(loan) === "active").sort(byCollectionOrderThenName);
    return <main className="shell dashboard-home"><header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">{isOwner ? "Financier dashboard" : "Collection agent dashboard"}</div></div><div className="top-actions"><Button onClick={logout}>Log out</Button></div></header><div className="toolbar"><div><h1 className="title">Dashboard</h1><p className="copy">Overview of your active finance customers and Chit Fund schemes.</p></div></div>{isOwner && authToken && <AccountsSummaryCard token={authToken} moneyFmt={money} />}<DashboardFinanceSection title="Daily Finance" customerLabel="Active Daily Customers" kind="daily" loans={dailyCustomers} onView={setDetail} canReorder={isOwner} showPnl={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={id => reorderDashboard("daily", id)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} /><DashboardFinanceSection title="Monthly Finance" customerLabel="Active Monthly Customers" kind="monthly" loans={monthlyCustomers} onView={setDetail} canReorder={isOwner} showPnl={isOwner} draggedId={draggedId} setDraggedId={setDraggedId} onReorder={id => reorderDashboard("monthly", id)} startTouchDrag={startTouchDrag} moveTouchDrag={moveTouchDrag} finishTouchDrag={finishTouchDrag} cancelTouchDrag={() => { touchTargetId.current = null; setDraggedId(null); }} />{portalNotice}{receiptSuccess && <ReceiptSuccessModal receipt={receiptSuccess} settings={orgSettings} token={authToken} onLogAction={onLogReceipt} close={() => setReceiptSuccess(null)} />}</main>;
  }
  {
    const loans = moduleLoans;
    const totalProfit = loans.reduce((sum, loan) => sum + realizedProfit(loan), 0), totalLoss = loans.reduce((sum, loan) => sum + realizedLoss(loan), 0);
  return <main className={`shell finance-module-shell ${module}`}><header className="top"><div><div className="brand">{businessName || "My Finance Business"}</div><div className="sub">{isOwner ? "Financier dashboard" : "Collection agent dashboard"}{dedicatedModule ? ` · ${module === "monthly" ? "Monthly" : "Daily"} collections` : " · Daily & monthly collections"}</div></div><Button onClick={logout}>Log out</Button></header><div className="toolbar"><div><h1 className="title">{customerMode ? "Customers" : module === "monthly" ? "Monthly Finance" : module === "daily" ? "Daily Finance" : "Finance portfolio"}</h1>{customerMode ? <p className="copy">Manage active and historical customer accounts.</p> : dedicatedModule ? <p className="copy">{module === "monthly" ? "Monthly interest accounts and payment reminders." : "Daily 100-day collection accounts."}</p> : !isOwner && <p className="copy">View assigned accounts and record only collections you receive.</p>}</div><div className="tabs">{customerMode ? <Button onClick={returnToDashboard}>← Dashboard</Button> : <><Button onClick={() => setCollectionMode(true)}>Today’s collections</Button>{isOwner && dedicatedModule && <Button onClick={openCustomerDirectory}>Customers</Button>}{isOwner && <Button className="primary" onClick={() => setModal("new")}>+ New finance account</Button>}</>}</div></div><div className="finance-module-body">{module === "monthly" && !customerMode && <UpcomingPaymentsSection moduleType="monthly" loans={loans} token={authToken} settings={orgSettings} workspace={workspace} isOwner={isOwner} />}<div className="grid metrics"><Metric label="Customers" value={loans.length} color="blue" /><Metric label="Amount financed" value={money(total)} color="gold" /><Metric label="Amounts received" value={money(loans.reduce((s, l) => s + loanPaid(l), 0))} color="green" /><Metric label="Outstanding" value={money(loans.reduce((s, l) => s + loanBalance(l), 0))} color="red" />{isOwner && <Metric label="Profit / loss" value={`${money(totalProfit)} / ${money(totalLoss)}`} color={totalLoss ? "red" : "green"} />}</div></div><div className="card"><div className="toolbar"><strong>{customerMode ? "All customer accounts" : "Open collection accounts"}</strong>{!dedicatedModule && <div className="tabs">{customerMode && <><Button className={`tab ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>All</Button><Button className={`tab ${statusFilter === "active" ? "active" : ""}`} onClick={() => setStatusFilter("active")}>Active</Button><Button className={`tab ${statusFilter === "completed" ? "active" : ""}`} onClick={() => setStatusFilter("completed")}>Completed</Button><Button className={`tab ${statusFilter === "closed" ? "active" : ""}`} onClick={() => setStatusFilter("closed")}>Closed</Button><Button className={`tab ${statusFilter === "bankrupt" ? "active" : ""}`} onClick={() => setStatusFilter("bankrupt")}>{customerMode ? "Defaulters" : "Bankrupt"}</Button></>}{customerMode ? <><Button className={`tab ${filter === "daily" ? "active" : ""}`} onClick={() => setFilter("daily")}>Daily</Button><Button className={`tab ${filter === "monthly" ? "active" : ""}`} onClick={() => setFilter("monthly")}>Monthly</Button></> : module === "all" && <><Button className={`tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</Button><Button className={`tab ${filter === "daily" ? "active" : ""}`} onClick={() => setFilter("daily")}>Daily</Button><Button className={`tab ${filter === "monthly" ? "active" : ""}`} onClick={() => setFilter("monthly")}>Monthly</Button></>}</div>}</div><div className="customer-search"><input aria-label="Search customer" placeholder="Search name, phone, or address" value={search} onChange={event => setSearch(event.target.value)} />{search && <Button onClick={() => setSearch("")}>Clear</Button>}</div><div className="table"><table><thead><tr>{isOwner && <th>Route</th>}<th>Customer</th><th>Finance</th><th>Amount financed</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>{shown.map((l, index) => <tr key={l.id} data-account-id={l.id} className={draggedId === l.id ? "route-row-dragging" : ""} draggable={isOwner} onDragStart={() => setDraggedId(l.id)} onDragEnd={() => setDraggedId(null)} onDragOver={e => isOwner && e.preventDefault()} onDrop={() => reorder(l.id)}><td className={isOwner ? "small route-handle" : "small"} onTouchStart={event => startTouchDrag(event, l.id)} onTouchMove={moveTouchDrag} onTouchEnd={finishTouchDrag} onTouchCancel={() => { touchTargetId.current = null; setDraggedId(null); }}>{isOwner && `↕ ${index + 1}`}</td><td><div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ width:34, height:34, borderRadius:"50%", display:"grid", placeItems:"center", background:"rgba(114,170,255,.16)", color:C.blue, fontWeight:700 }}>{l.customerName.charAt(0).toUpperCase()}</span><div><strong>{l.customerName}</strong><br /><a className="small phone-link" href={`tel:${l.phone}`}>{l.phone}</a></div></div></td><td>{l.kind === "daily" ? "Daily · 100 days" : "Monthly interest"}<br /><span className="small">{l.kind === "monthly" ? `${annualRate(l, today())}% per month` : `${money(l.dailyCollection)}/day`}</span>{l.kind === "daily" && loanStatus(l) === "active" && <><br /><span className="small">{`Day ${dailyProgress(l).completed} / 100 · ${dailyProgress(l).completed} completed · ${dailyProgress(l).remaining} remaining`}</span></>}{accountOutcome(l) && <><br /><span className="small">{`${accountOutcome(l).label} date: ${accountOutcome(l).date || "Not recorded"}${accountOutcome(l).days ? ` · ${accountOutcome(l).label} in ${accountOutcome(l).days} days` : ""}`}</span></>}</td><td>{money(l.kind === "daily" ? l.collectionAmount : l.principal)}</td><td className="green">{money(loanPaid(l))}</td><td className="red">{money(loanBalance(l))}</td><td><Badge status={loanStatus(l)} /></td><td><Button onClick={() => setDetail(l)}>View</Button>{["active", "overdue"].includes(loanStatus(l)) && <Button className="primary" disabled={collectedOn(l)} onClick={() => !collectedOn(l) && setModal(l)}>{collectedOn(l) ? "Collected today" : "Collect"}</Button>}</td></tr>)}</tbody></table></div>{shown.length === 0 && <p className="small spacer">No customers match your search.</p>}</div>{isOwner && modal === "new" && <NewFinance close={() => setModal(null)} save={createAccount} />}{modal && modal !== "new" && <Payment loan={modal} close={() => setModal(null)} save={addPayment} />}{portalNotice}</main>;
  }
}
function Customer({
  loan,
  logout
}) {
  const monthly = loan.kind === "monthly";
  return <main className="shell" style={{
    maxWidth: 700
  }}><header className="top"><div><div className="brand">FinTrack</div><div className="sub">Customer dashboard</div></div><Button onClick={logout}>Log out</Button></header><h1 className="title">Hello, {loan.customerName}</h1><p className="copy">Your finance ID: {loan.id}</p>{monthly ? <><div className="notice">You have taken {money(loan.principal)} on interest. Pay your monthly interest on time; you may repay the principal whenever you choose.</div><div className="grid metrics"><Metric label="Principal taken" value={money(loan.principal)} color="gold" /><Metric label="Principal remaining" value={money(monthlyBalance(loan))} color="red" /><Metric label="Monthly interest rate" value={`${annualRate(loan, today())}%`} color="blue" /><Metric label="Interest pending" value={money(monthlyInterestPending(loan))} color={monthlyInterestPending(loan) ? "red" : "green"} /><Metric label="Paid so far" value={money(loanPaid(loan))} color="green" /></div><div className="card"><strong>What you need to pay</strong><div className="row spacer"><span className="small">Current monthly interest on balance</span><strong className="gold">{money(Math.round(monthlyBalance(loan) * annualRate(loan, today()) / 100))}</strong></div><div className="row spacer"><span className="small">Estimated missed-payment penalty</span><strong className="red">{money(estimatedPenalty(loan))}</strong></div><p className="notice">Payment can be made via UPI, cash, or bank transfer. Contact your financier to record the payment.</p></div></> : <><div className="notice">You received {money(loan.disbursedAmount)}. Your daily collection plan is {money(loan.collectionAmount)} over 100 days.</div><div className="grid metrics"><Metric label="Amount received" value={money(loan.disbursedAmount)} color="gold" /><Metric label="Total to repay" value={money(loan.collectionAmount)} color="blue" /><Metric label="Daily collection" value={money(loan.dailyCollection)} color="gold" /><Metric label="Paid so far" value={money(dailyPaid(loan))} color="green" /><Metric label="Remaining" value={money(dailyBalance(loan))} color="red" /></div>{loanStatus(loan) === "active" && <div className="card"><strong>Repayment progress</strong><p className="small spacer">{Math.round(dailyPaid(loan) / loan.collectionAmount * 100)}% paid · {dailyProgress(loan).remaining} collection days remaining</p></div>}</>}<div className="card spacer"><strong>Your payment history</strong><div className="table spacer"><table><thead><tr><th>Date</th><th>Amount paid</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{[...loan.transactions].sort((a, b) => b.date.localeCompare(a.date)).map(t => <tr key={t.id}><td>{t.date}</td><td className="green">{money(monthly ? (+t.interestAmount || 0) + (+t.principalAmount || 0) + (+t.penaltyAmount || 0) : t.amount)}</td><td>{paymentModeLabel(t)}</td><td>{t.ref || "—"}</td></tr>)}</tbody></table></div></div></main>;
}

function DashboardFinanceSection({
  title,
  customerLabel,
  kind,
  loans,
  onView,
  canReorder = false,
  showPnl = false,
  draggedId,
  setDraggedId,
  onReorder,
  startTouchDrag,
  moveTouchDrag,
  finishTouchDrag,
  cancelTouchDrag,
}) {
  const financed = loans.reduce((sum, loan) => sum + (loan.kind === "daily" ? loan.collectionAmount : loan.principal), 0);
  const received = loans.reduce((sum, loan) => sum + loanPaid(loan), 0);
  const outstanding = loans.reduce((sum, loan) => sum + loanBalance(loan), 0);
  const profit = loans.reduce((sum, loan) => sum + realizedProfit(loan), 0);
  const loss = loans.reduce((sum, loan) => sum + realizedLoss(loan), 0);
  const icon = title === "Daily Finance" ? "◷" : "◫";
  const rows = [...loans].sort(byCollectionOrderThenName);
  const beginDrag = (event, loanId) => {
    if (!canReorder) return;
    if (event.target.closest("a,button")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", loanId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    setDraggedId(loanId);
  };
  return <section className="card dashboard-finance-section">
    <div className="toolbar dashboard-finance-heading">
      <div className="dashboard-finance-title">
        <div className="dashboard-finance-icon">{icon}</div>
        <div>
          <strong>{title}</strong>
          <p className="small">{customerLabel || "Active customer portfolio"}</p>
        </div>
      </div>
      <span className="badge active">{loans.length} active customers</span>
    </div>
    <div className="grid metrics dashboard-finance-metrics">
      <Metric label="Amount financed" value={money(financed)} color="gold" />
      <Metric label="Amounts received" value={money(received)} color="green" />
      <Metric label="Outstanding" value={money(outstanding)} color="red" />
      {showPnl && <Metric label="Profit / loss" value={`${money(profit)} / ${money(loss)}`} color={loss ? "red" : "green"} />}
    </div>
    {canReorder && rows.length > 1 && <p className="small dashboard-reorder-hint">Drag the handle to save your {kind} collection order. It is restored after refresh and sign-in.</p>}
    {rows.length ? <div className={`table dashboard-finance-table${canReorder ? " can-reorder" : ""}`}>
      <table>
        <thead>
          <tr>
            {canReorder && <th>Order</th>}
            <th>Customer</th>
            <th>Financed</th>
            <th>Balance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((loan, index) => <tr
            key={loan.id}
            data-account-id={loan.id}
            className={draggedId === loan.id ? "route-row-dragging" : ""}
            draggable={canReorder}
            aria-grabbed={canReorder ? draggedId === loan.id : undefined}
            onDragStart={event => beginDrag(event, loan.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={event => canReorder && event.preventDefault()}
            onDrop={event => {
              if (!canReorder) return;
              event.preventDefault();
              onReorder?.(loan.id);
            }}
          >
            {canReorder && <DashboardDragHandle
              index={index + 1}
              customerName={loan.customerName}
              loanId={loan.id}
              startTouchDrag={startTouchDrag}
              moveTouchDrag={moveTouchDrag}
              finishTouchDrag={finishTouchDrag}
              cancelTouchDrag={cancelTouchDrag}
            />}
            <td><strong>{loan.customerName}</strong><br /><a className="small phone-link" href={`tel:${loan.phone}`}>{loan.phone}</a></td>
            <td data-label="Financed">{money(loan.kind === "daily" ? loan.collectionAmount : loan.principal)}</td>
            <td className="red" data-label="Balance">{money(loanBalance(loan))}</td>
            <td><Button onClick={() => onView(loan)}>View</Button></td>
          </tr>)}
        </tbody>
      </table>
    </div> : <p className="small spacer dashboard-finance-empty">No active customers.</p>}
  </section>;
}
function PinResetModal({ title, currentPin, onSave, close }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const save = () => {
    if (oldPin !== currentPin) return setError("Current PIN is incorrect.");
    if (!/^\d{4,}$/.test(newPin)) return setError("New PIN must be at least 4 digits.");
    if (newPin !== confirmPin) return setError("New PINs do not match.");
    onSave(newPin);
    close();
  };
  return <Modal><h2 className="title">Reset {title} PIN</h2><p className="copy">Choose a secure numeric PIN with at least four digits.</p><div className="tool-stack spacer"><Field label="Current PIN"><input type="password" value={oldPin} onChange={event => setOldPin(event.target.value)} /></Field><Field label="New PIN"><input type="password" value={newPin} onChange={event => setNewPin(event.target.value)} /></Field><Field label="Confirm new PIN"><input type="password" value={confirmPin} onChange={event => setConfirmPin(event.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" onClick={save}>Save new PIN</Button></div></Modal>;
}
function ChitFundMonthReport({ token }) {
  const [schemes, setSchemes] = useState([]);
  const [schemeId, setSchemeId] = useState("");
  const [monthNumber, setMonthNumber] = useState(1);
  const [details, setDetails] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const scheme = schemes.find(item => item.id === schemeId);
  useEffect(() => {
    let ignore = false;
    loadChitSchemes(token).then(list => {
      if (ignore) return;
      setSchemes(list || []);
      const first = list?.[0];
      if (first) {
        setSchemeId(first.id);
        setMonthNumber(currentSchemeMonth(first));
      } else {
        setBusy(false);
      }
    }).catch(err => { if (!ignore) { setError(err.message || "Could not load Chit Fund schemes."); setBusy(false); } });
    return () => { ignore = true; };
  }, [token]);
  useEffect(() => {
    if (!schemeId) { setDetails(null); return; }
    let ignore = false;
    setBusy(true);
    loadChitSchemeDetails(token, schemeId).then(payload => {
      if (ignore) return;
      setDetails(payload);
      setError("");
      setBusy(false);
    }).catch(err => { if (!ignore) { setError(err.message || "Could not load scheme details."); setBusy(false); } });
    return () => { ignore = true; };
  }, [token, schemeId]);
  const statement = scheme && details ? buildChitMonthStatement({ scheme, details, monthNumber }) : null;
  const months = Array.from({ length: Number(scheme?.duration_months || 0) }, (_, index) => index + 1);
  const download = () => {
    try {
      setError("");
      downloadChitMonthStatementPdf({ scheme, details, monthNumber });
    } catch (err) {
      setError(err.message || "Could not download statement.");
    }
  };
  return <>
    <p className="copy spacer">Download a month statement for any Chit Fund scheme. Daily and Monthly reports are unchanged.</p>
    <div className="form spacer">
      <Field label="Scheme"><select value={schemeId} onChange={event => { const next = schemes.find(item => item.id === event.target.value); setSchemeId(event.target.value); if (next) setMonthNumber(currentSchemeMonth(next)); }}>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Month"><select value={monthNumber} onChange={event => setMonthNumber(Number(event.target.value))}>{months.map(month => <option key={month} value={month}>{chitMonthLabel(scheme.start_date, month)}</option>)}</select></Field>
    </div>
    {error && <p className="red small">{error}</p>}
    {busy && <p className="small spacer">Loading Chit Fund statement…</p>}
    {statement && !busy && <>
      <div className="grid metrics">
        <Metric label="Expected" value={money(statement.expected)} color="gold" />
        <Metric label="Collected" value={money(statement.collected)} color="green" />
        <Metric label="Pending" value={money(statement.pending)} color="red" />
        <Metric label="Collection progress" value={`${statement.progress}%`} color="blue" />
      </div>
      <div className="row spacer">
        <span className="small">PDF includes auction/prize, member collections, and outstanding dues for {statement.monthLabel}.</span>
        <Button className="primary" onClick={download}>Download PDF</Button>
      </div>
    </>}
    {!busy && !schemes.length && <p className="small spacer">No Chit Fund schemes yet.</p>}
  </>;
}
function PortfolioReport({ loans, token, close }) {
  const [tab, setTab] = useState("collections"), [kind, setKind] = useState("all"), [status, setStatus] = useState("all"), [customer, setCustomer] = useState(""), [reportDate, setReportDate] = useState(today()), [error, setError] = useState("");
  const filtered = loans.filter(loan => (kind === "all" || loan.kind === kind) && (status === "all" || loanStatus(loan) === status) && loan.customerName.toLowerCase().includes(customer.toLowerCase()));
  const total = key => filtered.reduce((sum, loan) => sum + key(loan), 0);
  const daily = filtered.filter(loan => loan.kind === "daily"), monthly = filtered.filter(loan => loan.kind === "monthly");
  const netPosition = total(realizedProfit) - total(realizedLoss);
  const download = () => { try { setError(""); downloadDailyReport(filtered, reportDate); } catch (e) { setError(e.message); } };
  return <Modal><div className="row"><h2 className="title">Reports</h2><Button onClick={close}>Close</Button></div><div className="tabs spacer"><Button className={`tab ${tab === "collections" ? "active" : ""}`} onClick={() => setTab("collections")}>Daily Collection Reports</Button><Button className={`tab ${tab === "profit" ? "active" : ""}`} onClick={() => setTab("profit")}>Profit &amp; Loss Report</Button><Button className={`tab ${tab === "chit" ? "active" : ""}`} onClick={() => setTab("chit")}>Chit Fund</Button></div>{tab === "collections" ? <><p className="copy spacer">Review and download Daily and Monthly collection activity for a selected date.</p><div className="form spacer"><Field label="Collection report date"><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} /></Field><Field label="Finance type"><select value={kind} onChange={e => setKind(e.target.value)}><option value="all">Daily + Monthly</option><option value="daily">Daily finance</option><option value="monthly">Monthly finance</option></select></Field><Field label="Account status"><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="bankrupt">Bankrupt</option></select></Field><Field className="span" label="Customer"><input placeholder="Filter by customer name" value={customer} onChange={e => setCustomer(e.target.value)} /></Field></div><div className="grid metrics"><Metric label="Accounts in report" value={filtered.length} color="blue" /><Metric label="Expected collection" value={money(filtered.reduce((sum, loan) => sum + (loan.kind === "daily" ? loan.dailyCollection : Math.round(monthlyBalance(loan, reportDate) * annualRate(loan, reportDate) / 100)), 0))} color="gold" /><Metric label="Collected on selected date" value={money(filtered.reduce((sum, loan) => sum + loan.transactions.filter(t => t.date === reportDate).reduce((value, t) => value + paymentValue(loan, t), 0), 0))} color="green" /><Metric label="Outstanding" value={money(total(loanBalance))} color="red" /></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><span className="small">The download includes customer details, expected and actual collection, notes, and Collected By.</span><Button className="primary" onClick={download}>Download collection report</Button></div></> : tab === "profit" ? <><p className="copy spacer">Financial position based on the saved Daily and Monthly finance transactions. Outstanding amounts are receivables, not losses.</p><div className="form spacer"><Field label="Finance type"><select value={kind} onChange={e => setKind(e.target.value)}><option value="all">Daily + Monthly</option><option value="daily">Daily finance</option><option value="monthly">Monthly finance</option></select></Field><Field label="Account status"><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="closed">Closed</option><option value="bankrupt">Bankrupt</option></select></Field><Field label="Customer"><input placeholder="Filter by customer name" value={customer} onChange={e => setCustomer(e.target.value)} /></Field></div><div className="grid metrics"><Metric label="Paid to customers" value={money(total(investedAmount))} color="gold" /><Metric label="Total collected" value={money(total(loanPaid))} color="green" /><Metric label="Outstanding / receivable" value={money(total(loanBalance))} color="red" /><Metric label="Realized profit" value={money(total(realizedProfit))} color="green" /><Metric label="Loss / bankrupt" value={money(total(realizedLoss))} color="red" /><Metric label="Net profit / loss" value={money(netPosition)} color={netPosition < 0 ? "red" : "green"} /></div><div className="grid two spacer"><div className="card"><strong>Daily finance</strong><p className="small">Paid to customers: {money(daily.reduce((sum, loan) => sum + investedAmount(loan), 0))} · Collected: {money(daily.reduce((sum, loan) => sum + loanPaid(loan), 0))}</p><p className="small">Profit: {money(daily.reduce((sum, loan) => sum + realizedProfit(loan), 0))} · Loss: {money(daily.reduce((sum, loan) => sum + realizedLoss(loan), 0))} · Outstanding: {money(daily.reduce((sum, loan) => sum + loanBalance(loan), 0))}</p></div><div className="card"><strong>Monthly finance</strong><p className="small">Paid to customers: {money(monthly.reduce((sum, loan) => sum + investedAmount(loan), 0))} · Collected: {money(monthly.reduce((sum, loan) => sum + loanPaid(loan), 0))}</p><p className="small">Profit: {money(monthly.reduce((sum, loan) => sum + realizedProfit(loan), 0))} · Loss: {money(monthly.reduce((sum, loan) => sum + realizedLoss(loan), 0))} · Outstanding: {money(monthly.reduce((sum, loan) => sum + loanBalance(loan), 0))}</p></div></div></> : <ChitFundMonthReport token={token} />}</Modal>;
}
function ResetStaffPasswordModal({ staff, close, save }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true); setError("");
    try { await save(password); close(); }
    catch (err) { setError(err?.message || "Could not reset password."); }
    finally { setBusy(false); }
  };
  return <Modal close={close}><h2 className="title">Reset staff password</h2><p className="copy">Set a new password for {staff.full_name}. Share it with them privately.</p><Field className="spacer" label="New password"><input type="password" minLength="8" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close} disabled={busy}>Cancel</Button><Button className="primary" disabled={busy || password.length < 8} onClick={submit}>{busy ? "Saving…" : "Reset password"}</Button></div></Modal>;
}
function CollectionStaffPage({ loans, close, loadAgents, createAgent, assignAgent, updateAgent }) {
  const [agents, setAgents] = useState([]), [selected, setSelected] = useState(null), [search, setSearch] = useState(""), [showCreate, setShowCreate] = useState(false), [showEdit, setShowEdit] = useState(false), [showResetPassword, setShowResetPassword] = useState(false), [error, setError] = useState(""), [draftIds, setDraftIds] = useState([]), [saved, setSaved] = useState(""), [loading, setLoading] = useState(true);
  const refresh = async () => { setLoading(true); setError(""); try { setAgents(await loadAgents()); } catch (e) { setError(e.message || "Could not load staff."); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const assigned = loan => draftIds.includes(loan.id);
  const visibleLoans = staffAssignableLoans(loans, { selectedAgentId: selected?.id, search, statusOf: loanStatus }).sort(byCustomerName);
  const choose = agent => { setSelected(agent); setDraftIds(loans.filter(loan => loan.collectionAgentId === agent.id).map(loan => loan.id)); setSearch(""); setSaved(""); };
  const toggle = id => setDraftIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const saveStaff = async details => { try { const updated = await updateAgent({ id: selected.id, ...details }); setSelected(updated); setAgents(current => current.map(agent => agent.id === updated.id ? updated : agent)); setShowEdit(false); setSaved("Staff details saved successfully."); } catch (e) { setError(e.message || "Could not save staff details."); } };
  const saveAssignments = async () => {
    try {
      const changes = loans.map(loan => {
        const next = draftIds.includes(loan.id) ? selected.id : loan.collectionAgentId === selected.id ? "" : loan.collectionAgentId;
        if (next === loan.collectionAgentId) return null;
        return { account_id: loan.id, agent_id: next || null };
      }).filter(Boolean);
      await assignAgent(changes);
      setAgents(current => current.map(agent => agent.id === selected.id ? { ...agent, assigned_customer_count: draftIds.length } : agent));
      setSaved("Customer assignments saved successfully.");
    } catch (e) { setError(e.message || "Could not save assignments."); }
  };
  return <Modal><div className="row"><Button onClick={selected ? () => setSelected(null) : close}>← Back</Button><h2 className="title">Collection Staff</h2></div>{error && <p className="red small">{error}</p>}{!selected ? <><div className="row spacer"><span className="copy">Create staff, review existing staff, and assign customer accounts.</span><Button className="primary" onClick={() => setShowCreate(true)}>+ Create New Agent</Button></div>{loading ? <p className="small spacer">Loading collection staff…</p> : <div className="table spacer"><table><thead><tr><th>Agent</th><th>Email</th><th>Mobile</th><th>Status</th><th>Assigned customers</th><th></th></tr></thead><tbody>{agents.map(agent => <tr key={agent.id}><td>{agent.full_name}</td><td>{agent.email || "—"}</td><td>{agent.phone || "—"}</td><td><Badge status={agent.is_active ? "active" : "closed"} /></td><td>{agent.assigned_customer_count || 0}</td><td><Button onClick={() => choose(agent)}>View / Assign</Button></td></tr>)}</tbody></table></div>}</> : <div className="card spacer"><div className="row"><h3>{selected.full_name}</h3><Button onClick={() => setShowEdit(true)}>Edit staff</Button><Button onClick={() => setShowResetPassword(true)}>Reset password</Button></div><p className="small">Email and mobile number can be changed using Edit staff. Select customers, then save. {draftIds.length} customers selected.</p>{saved && <p className="green small">{saved}</p>}<div className="customer-search"><input placeholder="Search customers" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="table"><table><thead><tr><th>Customer</th><th>Finance</th><th>Outstanding</th><th>Assigned</th></tr></thead><tbody>{visibleLoans.map(loan => <tr key={loan.id}><td>{loan.customerName}<br /><span className="small">{loan.phone}</span></td><td>{financeKindLabel(loan.kind)}</td><td>{money(loanBalance(loan))}</td><td><input type="checkbox" checked={assigned(loan)} onChange={() => toggle(loan.id)} /></td></tr>)}</tbody></table></div><div className="row spacer"><Button onClick={() => choose(selected)}>Cancel</Button><Button className="primary" onClick={saveAssignments}>Save Changes</Button></div></div>}{showEdit && <EditCollectionStaff staff={selected} close={() => setShowEdit(false)} save={saveStaff} />}{showResetPassword && selected && <ResetStaffPasswordModal staff={selected} close={() => setShowResetPassword(false)} save={async password => { await updateAgent({ id: selected.id, name: selected.full_name, email: selected.email, phone: selected.phone, active: selected.is_active, password }); setSaved("Password reset successfully."); }} />}{showCreate && <CreateAgent close={() => { setShowCreate(false); refresh(); }} save={async details => { await createAgent(details); }} />}</Modal>;
}
function EditCollectionStaff({ staff, close, save }) {
  const [name, setName] = useState(staff.full_name || ""), [email, setEmail] = useState(staff.email || ""), [phone, setPhone] = useState(staff.phone || ""), [active, setActive] = useState(staff.is_active !== false), [busy, setBusy] = useState(false);
  const submit = async () => { if (!name.trim() || !email.trim()) return; setBusy(true); try { await save({ name, email, phone, active }); } finally { setBusy(false); } };
  return <Modal close={close}><h2 className="title">Edit collection staff</h2><p className="copy">Update contact details or account status. Password changes use the separate Reset password action.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Status"><select value={active ? "active" : "inactive"} onChange={e => setActive(e.target.value === "active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div><div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy || !name.trim() || !email.trim()} onClick={submit}>{busy ? "Saving…" : "Save Changes"}</Button></div></Modal>;
}
function CreateAgent({ close, save }) {
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setError(""); try { await save({ name, email, phone, password, active: true }); close(); } catch (e) { setError(e.message || "Could not create agent."); } finally { setBusy(false); } };
  return <Modal><h2 className="title">Add collection staff</h2><p className="copy">Staff get only assigned accounts and can record their own collections.</p><div className="form spacer"><Field label="Staff name"><input value={name} onChange={e => setName(e.target.value)} /></Field><Field label="Email address"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field><Field label="Mobile number"><input inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Password"><input type="password" minLength="8" value={password} onChange={e => setPassword(e.target.value)} /></Field></div>{error && <p className="red small">{error}</p>}<div className="row spacer"><Button onClick={close}>Cancel</Button><Button className="primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create staff"}</Button></div></Modal>;
}
function ActiveChitSchemes({ schemes = [], onOpen }) {
  const typeLabel = type => type === "fixed" ? "Fixed" : type === "fixed_predefined_bid" ? "Fixed Predefined Bid" : "Auction";
  useEffect(() => {
    const cards = [...document.querySelectorAll(".dashboard-chit-card")];
    const open = event => onOpen(event.currentTarget.dataset.schemeId);
    cards.forEach((card, index) => {
      card.dataset.schemeId = schemes[index]?.id || "";
      card.addEventListener("click", open);
    });
    return () => cards.forEach(card => card.removeEventListener("click", open));
  }, [onOpen, schemes]);
  return <><style>{`.dashboard-chit{margin-left:240px;max-width:calc(1420px + 240px);padding:0 44px 36px}.dashboard-chit-panel{padding:22px;background:linear-gradient(145deg,#202a3b,#1b2230)}.dashboard-chit-heading{display:flex;align-items:center;gap:12px}.dashboard-chit-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#f4b94218;border:1px solid #f4b94255;color:#f4b942;font-size:20px}.dashboard-chit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:20px}.dashboard-chit-card{position:relative;padding:18px;border-radius:14px;background:#171d29;border:1px solid #303a4d;overflow:hidden}.dashboard-chit-card:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:#f4b942}.dashboard-chit-card:hover{border-color:#526078;transform:translateY(-1px)}.dashboard-chit-type{display:inline-flex;padding:4px 8px;border-radius:999px;background:#72aaff16;color:#8eb9ff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.dashboard-chit-name{margin:12px 0 4px;font:700 17px Syne;color:#f4f6fb}.dashboard-chit-value{font:700 24px Syne;color:#f4b942;margin:14px 0}.dashboard-chit-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:13px;border-top:1px solid #303a4d}.dashboard-chit-stats span{display:block;color:#9ba9bd;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.dashboard-chit-stats strong{display:block;margin-top:3px;font-size:13px;color:#e4e9f2}@media(max-width:1050px){.dashboard-chit{margin-left:0;padding:0 16px calc(96px + env(safe-area-inset-bottom,0px))}}@media(max-width:680px){.dashboard-chit{padding:0 16px calc(96px + env(safe-area-inset-bottom,0px))}.dashboard-chit-panel{padding:17px}.dashboard-chit-grid{grid-template-columns:1fr}}`}</style><section className="dashboard-chit"><div className="card dashboard-chit-panel"><div className="toolbar"><div className="dashboard-chit-heading"><div className="dashboard-chit-icon">◎</div><div><strong>Active Chit Fund Schemes</strong><p className="small">Current schemes across all Chit types</p></div></div><span className="badge active">{schemes.length} active</span></div>{schemes.length ? <div className="dashboard-chit-grid">{schemes.map(scheme => <article className="dashboard-chit-card" key={scheme.id}><span className="dashboard-chit-type">{typeLabel(scheme.chit_type)}</span><div className="dashboard-chit-name">{scheme.name}</div><div className="dashboard-chit-value">{money(scheme.chit_value)}</div><div className="dashboard-chit-stats"><div><span>Members</span><strong>{scheme.member_count}</strong></div><div><span>Duration</span><strong>{scheme.duration_months} months</strong></div></div></article>)}</div> : <p className="small spacer">No active Chit Fund schemes yet.</p>}</div></section></>;
}

function FinancierTools({ loans, token, activeChitSchemes = [], onCreateAgent, onLoadAgents, onAssignAgent, onUpdateAgent, orgSettings = {}, workspace = {}, onLogReceipt, onSettingsSaved, selectedModule = "all", onModuleChange = () => {} }) {
  const [panel, setPanel] = useState(null);
  const [dashboardChitSchemes, setDashboardChitSchemes] = useState(activeChitSchemes);
  const [openChitSchemeId, setOpenChitSchemeId] = useState(null);
  const reloadDashboardChit = () => loadActiveChitSchemes(token)
    .then(schemes => setDashboardChitSchemes(schemes || []))
    .catch(() => setDashboardChitSchemes([]));
  useEffect(() => {
    reloadDashboardChit();
  }, [token]);
  useEffect(() => {
    const showCustomers = () => setPanel("customers");
    const showAgents = () => setPanel("agents");
    window.addEventListener("fintrack-open-customers", showCustomers);
    window.addEventListener("fintrack-open-agents", showAgents);
    return () => {
      window.removeEventListener("fintrack-open-customers", showCustomers);
      window.removeEventListener("fintrack-open-agents", showAgents);
    };
  }, []);
  const goDashboard = () => {
    setPanel(null);
    setOpenChitSchemeId(null);
    window.dispatchEvent(new CustomEvent("fintrack-navigate-module", { detail: { kind: "all" } }));
  };
  const goModule = kind => {
    setPanel(null);
    setOpenChitSchemeId(null);
    window.dispatchEvent(new CustomEvent("fintrack-navigate-module", { detail: { kind } }));
  };
  const moreActive = ["more", "accounts", "agents", "settings"].includes(panel);
  const openMoreSection = nextPanel => {
    setPanel(nextPanel);
    setOpenChitSchemeId(null);
    window.dispatchEvent(new CustomEvent("fintrack-navigate-module", { detail: { kind: "all" } }));
  };
  return <div className="financier-tools">
    <aside className="financier-nav">
      <div className="nav-title">FinTrack</div>
      <Button className={panel === "dashboard" || (panel === null && selectedModule === "all") ? "tab active" : ""} onClick={goDashboard}><span className="nav-label"><span className="nav-glyph">▦</span><span className="nav-long">Dashboard</span><span className="nav-short">Dash</span></span></Button>
      <Button className={panel === null && selectedModule === "daily" ? "tab active" : ""} onClick={() => goModule("daily")}><span className="nav-label"><span className="nav-glyph">▣</span><span className="nav-long">Daily Finance</span><span className="nav-short">Daily</span></span></Button>
      <Button className={panel === null && selectedModule === "monthly" ? "tab active" : ""} onClick={() => goModule("monthly")}><span className="nav-label"><span className="nav-glyph">◫</span><span className="nav-long">Monthly Finance</span><span className="nav-short">Monthly</span></span></Button>
      {workspace?.role === "owner" && <Button className={panel === "reports" ? "tab active" : ""} onClick={() => setPanel("reports")}><span className="nav-label"><span className="nav-glyph">↧</span><span className="nav-long">Reports</span><span className="nav-short">Reports</span></span></Button>}
      {workspace?.role === "owner" && <Button className={panel === "chit" ? "tab active" : ""} onClick={() => setPanel("chit")}><span className="nav-label"><span className="nav-glyph">◎</span><span className="nav-long">Chit Fund</span><span className="nav-short">Chit</span></span></Button>}
      {workspace?.role === "owner" && <Button className={moreActive ? "tab active" : ""} onClick={() => setPanel("more")}><span className="nav-label"><span className="nav-glyph">⋯</span><span className="nav-long">More</span><span className="nav-short">More</span></span></Button>}
      {workspace?.role === "owner" && panel === "more" && <div className="financier-nav-more">
        <Button onClick={() => openMoreSection("accounts")}>Accounts</Button>
        <Button onClick={() => openMoreSection("agents")}>Collection Staff</Button>
        <Button onClick={() => openMoreSection("settings")}>Settings</Button>
      </div>}
      <div className="nav-footer">Financier workspace</div>
    </aside>
    {workspace?.role === "owner" && panel === "reports" && <PortfolioReport loans={loans} token={token} close={() => setPanel(null)} />}
    {workspace?.role === "owner" && panel === "accounts" && <div style={{ position: "fixed", inset: 0, zIndex: 5, overflow: "auto", background: C.bg }}><AccountsModule token={token} close={goDashboard} loans={loans} /></div>}
    {workspace?.role === "owner" && panel === "agents" && <CollectionStaffPage loans={loans} close={() => setPanel("more")} loadAgents={onLoadAgents} createAgent={onCreateAgent} assignAgent={onAssignAgent} updateAgent={onUpdateAgent} />}
    {workspace?.role === "owner" && panel === "chit" && <div className="chit-dashboard" style={{ position: "fixed", inset: 0, zIndex: 5, overflow: "auto", background: C.bg }}><ChitFundPage token={token} orgSettings={orgSettings} workspace={workspace} onLogReceipt={onLogReceipt} openSchemeId={openChitSchemeId} onOpenSchemeConsumed={() => setOpenChitSchemeId(null)} onSchemesChanged={schemes => setDashboardChitSchemes((schemes || []).filter(scheme => scheme.status === "active"))} close={goDashboard} /></div>}
    {workspace?.role === "owner" && panel === "settings" && <div style={{ position: "fixed", inset: 0, zIndex: 5, overflow: "auto", background: C.bg }}><ReceiptSettingsPage token={token} close={() => setPanel("more")} onSettingsSaved={onSettingsSaved} /></div>}
    {workspace?.role === "owner" && (panel === null || panel === "dashboard") && selectedModule === "all" && <ActiveChitSchemes schemes={dashboardChitSchemes} onOpen={schemeId => { setOpenChitSchemeId(schemeId); setPanel("chit"); }} />}
  </div>;
}
function CustomerReportDownload({ loan, onResetPin }) {
  const [reset, setReset] = useState(false);
  return <div className="customer-actions" style={{
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 5
  }}><div className="tabs">{onResetPin && <Button onClick={() => setReset(true)}>Reset PIN</Button>}<Button className="primary" onClick={() => downloadCustomerReport(loan)}>Download payment report</Button></div>{reset && onResetPin && <PinResetModal title="customer" currentPin={loan.pin} onSave={onResetPin} close={() => setReset(false)} />}</div>;
}
export default function App() {
  const isPasswordRecovery = new URLSearchParams(window.location.search).has("reset-password") || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
  const [legalView, setLegalView] = useState(() => legalViewFromLocation());
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loans, setLoans] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [financeModule, setFinanceModule] = useState("all");
  const [dataError, setDataError] = useState("");
  const sessionGen = useRef(0);
  const userRoleRef = useRef(null);
  const beginSession = () => { sessionGen.current += 1; return sessionGen.current; };
  const isCurrentSession = gen => gen === sessionGen.current;
  const canApplyWorkspace = next => {
    const role = userRoleRef.current;
    return !role || role === "customer" || role === "chitCustomer" || financeRolesAligned(role, next?.role);
  };
  const clearFinanceState = () => {
    setLoans([]);
    setFinanceModule("all");
    setDataError("");
    setWorkspace(null);
    setUser(null);
  };
  useEffect(() => {
    const syncLegal = () => setLegalView(legalViewFromLocation());
    window.addEventListener("popstate", syncLegal);
    return () => window.removeEventListener("popstate", syncLegal);
  }, []);
  useEffect(() => {
    const gen = beginSession();
    let cancelled = false;
    supabase.auth.restoreSession()
      .then(async session => {
        if (!session?.access_token || cancelled || !isCurrentSession(gen)) return;
        const next = await loadWorkspace(session.access_token);
        if (cancelled || !isCurrentSession(gen)) return;
        flushSync(() => {
          setWorkspace(next);
          setUser({
            role: sessionUserRole(next.role),
            authToken: session.access_token,
            name: next.fullName,
          });
          userRoleRef.current = sessionUserRole(next.role);
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled && isCurrentSession(gen)) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);
  const refreshLoans = async (token = user?.authToken) => {
    if (!token) return;
    const gen = sessionGen.current;
    try {
      const next = await loadFinanceAccounts(token);
      if (!isCurrentSession(gen)) return;
      setLoans(next);
      setDataError("");
    } catch (error) {
      if (!isCurrentSession(gen)) return;
      setDataError(error.message || "Could not load finance records.");
    }
  };
  useEffect(() => {
    if (!user?.authToken) return undefined;
    const gen = sessionGen.current;
    let cancelled = false;
    loadFinanceAccounts(user.authToken)
      .then(next => {
        if (cancelled || !isCurrentSession(gen)) return;
        setLoans(next);
        setDataError("");
      })
      .catch(error => {
        if (cancelled || !isCurrentSession(gen)) return;
        setDataError(error.message || "Could not load finance records.");
      });
    return () => { cancelled = true; };
  }, [user?.authToken]);
  const enterSession = payload => {
    const { workspace: nextWorkspace, ...session } = payload;
    beginSession();
    setLoans([]);
    setFinanceModule("all");
    setDataError("");
    userRoleRef.current = session.role;
    flushSync(() => {
      setWorkspace(nextWorkspace || null);
      setUser(session);
    });
  };
  const refreshWorkspace = async (token = user?.authToken) => {
    if (!token) return null;
    const gen = sessionGen.current;
    try {
      const next = await loadWorkspace(token);
      if (!isCurrentSession(gen) || !canApplyWorkspace(next)) return null;
      setWorkspace(next);
      return next;
    } catch {
      return null;
    }
  };
  useEffect(() => {
    if (!user?.authToken) return undefined;
    const gen = sessionGen.current;
    let cancelled = false;
    loadWorkspace(user.authToken)
      .then(next => {
        if (cancelled || !isCurrentSession(gen) || !canApplyWorkspace(next)) return;
        setWorkspace(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.authToken]);
  useLayoutEffect(() => {
    const role = ownerChromeAllowed(user?.role, workspace?.role) ? "owner"
      : user?.role === "agent" && workspace?.role === "staff" ? "staff"
      : "unknown";
    document.documentElement.dataset.ftRole = role;
    return () => { delete document.documentElement.dataset.ftRole; };
  }, [user?.role, workspace?.role]);
  const customerLoan = user?.role === "customer" ? user.loan : null;
  const logout = async () => {
    const role = user?.role;
    beginSession();
    userRoleRef.current = null;
    clearFinanceState();
    if (role === "financier" || role === "agent") await supabase.auth.signOut();
  };
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
    return { portalId, pin };
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
  const financeSession = user?.role === "financier" || user?.role === "agent";
  const showOwnerChrome = ownerChromeAllowed(user?.role, workspace?.role);
  const waitingForWorkspaceRole = financeSession && !financeRolesAligned(user?.role, workspace?.role);
  if (legalView) {
    return <div className="app"><style>{styles + enhancements + homeReportHide + visualRefresh + mobileCollections + mobileLayout}</style><LegalPage view={legalView} /></div>;
  }
  if ((!authReady || waitingForWorkspaceRole) && !isPasswordRecovery) {
    return <div className="app"><style>{styles + enhancements + homeReportHide + visualRefresh + mobileCollections + mobileLayout}</style><div className="login"><p className="sub" style={{ textAlign: "center" }}>Loading FinTrack…</p></div></div>;
  }
  return <div className="app"><style>{styles + enhancements + homeReportHide + visualRefresh + accountsStyles + creditScoreStyles + mobileCollections + mobileLayout + receiptStyles + `.phone-link{color:${C.blue};text-decoration:none}.phone-link:hover{text-decoration:underline}`}</style>{isPasswordRecovery ? <PasswordRecovery /> : !user ? <FinancierAuth onLogin={enterSession} onCustomerLogin={loan => setUser({ role: "customer", loan })} onChitCustomerLogin={session => setUser({ role: "chitCustomer", session })} /> : user.role === "financier" || user.role === "agent" ? <>{dataError && <div className="notice" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20 }}>{dataError}</div>}<Financier loans={loans} businessName={workspace?.businessName} setLoans={setLoans} onCreateLoan={createLoan} onRecordPayment={savePayment} onUpdateLoan={updateLoan} onDeleteLoan={removeLoan} onSaveCustomerPortal={saveCustomerPortal} onLoadKyc={getKyc} onSaveKyc={updateKyc} onStatusChange={changeStatus} onPaymentNoteChange={changePaymentNotes} onPaymentCorrect={correctPayment} onPaymentDelete={removePayment} onCollectionOrderChange={changeCollectionOrder} role={showOwnerChrome ? "owner" : "staff"} logout={logout} authToken={user.authToken} orgSettings={workspace?.organizationSettings || {}} workspace={workspace || {}} onLogReceipt={logReceipt} module={financeModule} onModuleChange={setFinanceModule} />{showOwnerChrome && <FinancierTools loans={loans} token={user.authToken} orgSettings={workspace?.organizationSettings || {}} workspace={workspace || {}} onLogReceipt={logReceipt} onSettingsSaved={() => refreshWorkspace()} selectedModule={financeModule} onModuleChange={setFinanceModule} onCreateAgent={addCollectionAgent} onLoadAgents={getManagedAgents} onAssignAgent={updateAgentAssignment} onUpdateAgent={saveCollectionStaff} />}</> : user.role === "chitCustomer" ? <ChitCustomerPortal session={user.session} logout={logout} /> : <><Customer loan={customerLoan} logout={logout} /><CustomerReportDownload loan={customerLoan} /></>}</div>;
}
