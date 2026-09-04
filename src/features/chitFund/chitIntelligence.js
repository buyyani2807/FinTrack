import { formatInr } from "../../lib/formatMoney.js";
import { CHIT_TYPES, normalizeFixedCommissionAmount } from "./fixedChit.js";
import { chitTypeLabel } from "./memberPortal.js";
import { currentSchemeMonth } from "./monthStatement.js";
import { chitPaymentAmounts } from "./memberPayments.js";
import { buildChitUpcomingRows } from "../receipts/upcomingPayments.js";

const money = value => formatInr(value);
const schemeType = scheme => scheme?.chit_type || CHIT_TYPES.AUCTION;
const memberName = enrollment => enrollment?.chit_members?.full_name || "Member";

const bidTrend = amounts => {
  if (!amounts || amounts.length < 3) return null;
  const recent = amounts.slice(-3);
  const first = recent[0];
  const last = recent[2];
  if (!(first > 0) || last === first) return last === first ? "unchanged" : null;
  return last < first ? "decreased" : "increased";
};

export function buildChitFacts({
  schemes = [],
  enrollments = [],
  cycles = [],
  fixedLifts = [],
  predefinedSchedule = [],
  upcomingRows = [],
  asOf,
} = {}) {
  const today = asOf;
  const activeSchemes = schemes.filter(scheme => scheme.status === "active");
  const activeMembers = enrollments.filter(item => item.status === "active");
  const upcoming = buildChitUpcomingRows(upcomingRows, today);
  const pendingAmount = upcoming.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const approaching = upcoming.filter(item => item.daysRemaining != null && item.daysRemaining <= 3);
  const overdue = upcoming.filter(item => String(item.dueDate || "") < today);
  const bySchemeOutstanding = new Map();
  upcoming.forEach(item => {
    const name = item.schemeName || "Scheme";
    bySchemeOutstanding.set(name, (bySchemeOutstanding.get(name) || 0) + Number(item.amount || 0));
  });
  const largestOutstanding = [...bySchemeOutstanding.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const auctionSchemes = activeSchemes.filter(scheme => schemeType(scheme) === CHIT_TYPES.AUCTION);
  const fixedSchemes = activeSchemes.filter(scheme => schemeType(scheme) === CHIT_TYPES.FIXED);
  const predefinedSchemes = activeSchemes.filter(scheme => schemeType(scheme) === CHIT_TYPES.FIXED_PREDEFINED_BID);

  const auctionInsights = auctionSchemes.map(scheme => {
    const schemeCycles = cycles.filter(cycle => cycle.scheme_id === scheme.id && Number(cycle.winning_bid_amount) > 0)
      .sort((a, b) => a.cycle_number - b.cycle_number);
    const amounts = schemeCycles.map(cycle => Number(cycle.winning_bid_amount));
    const latest = schemeCycles.at(-1);
    const winner = activeMembers.find(item => item.id === latest?.winning_enrollment_id);
    return {
      id: scheme.id,
      name: scheme.name,
      type: CHIT_TYPES.AUCTION,
      typeLabel: chitTypeLabel(CHIT_TYPES.AUCTION),
      currentMonth: latest ? `Month ${latest.cycle_number}` : `Month ${currentSchemeMonth(scheme, new Date(`${today}T12:00:00`))}`,
      latestBid: latest ? Number(latest.winning_bid_amount) : null,
      latestWinner: winner ? memberName(winner) : null,
      bidCount: amounts.length,
      averageBid: amounts.length ? Math.round(amounts.reduce((sum, value) => sum + value, 0) / amounts.length) : null,
      trend: bidTrend(amounts),
    };
  });

  const fixedInsights = fixedSchemes.map(scheme => {
    const lifts = fixedLifts.filter(item => item.scheme_id === scheme.id).sort((a, b) => a.month_number - b.month_number);
    const current = lifts.find(item => item.status === "pending") || lifts.at(-1);
    const recipient = activeMembers.find(item => item.id === current?.enrollment_id);
    const month = current?.month_number || currentSchemeMonth(scheme, new Date(`${today}T12:00:00`));
    const duration = Number(scheme.duration_months || 0);
    return {
      id: scheme.id,
      name: scheme.name,
      type: CHIT_TYPES.FIXED,
      typeLabel: chitTypeLabel(CHIT_TYPES.FIXED),
      currentMonth: `Month ${month}`,
      recipient: recipient ? memberName(recipient) : null,
      chitAmount: Number(scheme.chit_value || 0),
      liftAmount: current ? Number(current.lift_amount || 0) : null,
      commission: normalizeFixedCommissionAmount(scheme.chit_value, scheme.fixed_commission_amount || scheme.commission_percent),
      installment: Number(scheme.installment_amount || 0),
      remainingInstallments: duration ? Math.max(0, duration - Number(month || 0)) : null,
    };
  });

  const predefinedInsights = predefinedSchemes.map(scheme => {
    const schedule = predefinedSchedule.filter(item => item.scheme_id === scheme.id).sort((a, b) => a.month_number - b.month_number);
    const current = schedule.find(item => item.status === "pending") || schedule.at(-1);
    const recipient = activeMembers.find(item => item.id === current?.enrollment_id);
    return {
      id: scheme.id,
      name: scheme.name,
      type: CHIT_TYPES.FIXED_PREDEFINED_BID,
      typeLabel: chitTypeLabel(CHIT_TYPES.FIXED_PREDEFINED_BID),
      currentMonth: current ? `Month ${current.month_number}` : `Month ${currentSchemeMonth(scheme, new Date(`${today}T12:00:00`))}`,
      recipient: recipient ? memberName(recipient) : null,
      bidAmount: current ? Number(current.bid_amount || 0) : null,
      installment: current ? Number(current.emi || 0) : Number(scheme.installment_amount || 0),
      netReceivable: current ? Number(current.net_receivable || 0) : null,
    };
  });

  const missedMembers = [];
  const seen = new Set();
  upcoming.forEach(item => {
    const key = item.enrollmentId || item.customerName;
    if (seen.has(key)) return;
    seen.add(key);
    const amounts = chitPaymentAmounts(item);
    if (amounts.balance <= 0) return;
    missedMembers.push({
      name: item.customerName,
      schemeName: item.schemeName,
      amount: amounts.balance || item.amount,
      dueDate: item.dueDate,
    });
  });

  return {
    module: "chit",
    asOf: today,
    activeSchemeCount: activeSchemes.length,
    totalSchemeCount: schemes.length,
    memberCount: activeMembers.length,
    auctionCount: auctionSchemes.length,
    fixedCount: fixedSchemes.length,
    predefinedCount: predefinedSchemes.length,
    pendingInstallmentCount: upcoming.length,
    pendingAmount,
    approachingCount: approaching.length,
    overdueCount: overdue.length,
    largestOutstanding: largestOutstanding ? { name: largestOutstanding[0], amount: largestOutstanding[1] } : null,
    auctionInsights,
    fixedInsights,
    predefinedInsights,
    missedMembers: missedMembers.slice(0, 12),
  };
}

export function interpretChitFacts(facts) {
  const summary = facts.activeSchemeCount
    ? `${facts.activeSchemeCount} active scheme${facts.activeSchemeCount === 1 ? " is" : "s are"} running with ${facts.memberCount} member${facts.memberCount === 1 ? "" : "s"}.`
    : "No active Chit Fund schemes to interpret.";
  const attention = [
    facts.overdueCount ? `${facts.overdueCount} member${facts.overdueCount === 1 ? " has" : "s have"} pending installments past due.` : null,
    facts.pendingInstallmentCount ? `${facts.pendingInstallmentCount} installment${facts.pendingInstallmentCount === 1 ? " is" : "s are"} still outstanding.` : null,
    facts.largestOutstanding ? `${facts.largestOutstanding.name} has ${money(facts.largestOutstanding.amount)} outstanding.` : null,
    facts.approachingCount ? `${facts.approachingCount} member${facts.approachingCount === 1 ? " is" : "s are"} approaching the next installment date.` : null,
  ].filter(Boolean);
  const auctionTrend = facts.auctionInsights.find(row => row.trend);
  const auctionLatest = facts.auctionInsights.find(row => row.latestBid != null);
  const actions = [
    facts.pendingInstallmentCount ? `Follow up on ${facts.pendingInstallmentCount} pending installment${facts.pendingInstallmentCount === 1 ? "" : "s"}.` : null,
    facts.largestOutstanding ? `Review ${money(facts.largestOutstanding.amount)} outstanding in ${facts.largestOutstanding.name}.` : null,
    !facts.pendingInstallmentCount && facts.activeSchemeCount ? "No pending installments are currently flagged." : null,
  ].filter(Boolean);
  const auctionInsights = facts.auctionInsights.length
    ? [
        auctionLatest ? `${auctionLatest.name}: latest recorded winning bid ${money(auctionLatest.latestBid)}${auctionLatest.latestWinner ? ` · ${auctionLatest.latestWinner}` : ""}.` : "No recorded auction bids yet.",
        auctionTrend ? `Winning bids have ${auctionTrend.trend} over the last three recorded months in ${auctionTrend.name}.` : facts.auctionInsights.some(row => row.bidCount < 3)
          ? "Not enough recorded bids to describe a bid trend."
          : null,
        auctionLatest?.averageBid != null ? `Average recorded winning bid in ${auctionLatest.name} is ${money(auctionLatest.averageBid)}.` : null,
      ].filter(Boolean)
    : ["No auction schemes are currently active."];
  const fixedInsights = facts.fixedInsights.length
    ? facts.fixedInsights.slice(0, 3).map(row => {
      const parts = [
        `${row.name} is in ${row.currentMonth}`,
        row.recipient ? `current recipient ${row.recipient}` : null,
        row.liftAmount != null ? `lift ${money(row.liftAmount)}` : null,
        row.installment ? `member installment ${money(row.installment)}` : null,
        row.remainingInstallments != null ? `${row.remainingInstallments} remaining installments` : null,
      ].filter(Boolean);
      return `${parts.join(" · ")}.`;
    })
    : [];
  const predefinedInsights = facts.predefinedInsights.length
    ? facts.predefinedInsights.slice(0, 3).map(row => {
      const parts = [
        `${row.name} is in ${row.currentMonth}`,
        row.recipient ? `current recipient ${row.recipient}` : null,
        row.bidAmount != null ? `scheduled bid ${money(row.bidAmount)}` : null,
        row.installment ? `EMI ${money(row.installment)}` : null,
      ].filter(Boolean);
      return `${parts.join(" · ")}.`;
    })
    : [];

  return {
    kicker: "AI chit fund insights",
    note: `Interpretation of verified Chit Fund schemes, members, and installments · ${facts.asOf}`,
    summary,
    attention: attention.slice(0, 4),
    performance: [
      { label: "Active schemes", value: String(facts.activeSchemeCount), kind: "verified" },
      { label: "Members", value: String(facts.memberCount), kind: "verified" },
      { label: "Pending installments", value: String(facts.pendingInstallmentCount), kind: "verified" },
      { label: "Outstanding", value: money(facts.pendingAmount), kind: "verified" },
    ],
    actions: actions.slice(0, 4),
    priorities: facts.missedMembers.slice(0, 5).map(row => ({
      id: `${row.schemeName}-${row.name}`,
      name: row.name,
      dueToday: row.amount,
      outstanding: row.amount,
      why: [`${money(row.amount)} pending in ${row.schemeName}`, row.dueDate ? `due ${row.dueDate}` : null].filter(Boolean),
    })),
    details: [
      {
        id: "overview",
        title: "Scheme overview",
        verified: [
          { label: "Auction", value: String(facts.auctionCount) },
          { label: "Fixed", value: String(facts.fixedCount) },
          { label: "Predefined bid", value: String(facts.predefinedCount) },
          { label: "Members", value: String(facts.memberCount) },
        ],
        insights: [
          summary,
          facts.pendingAmount > 0 ? `${money(facts.pendingAmount)} in installments is still outstanding.` : "No outstanding installments are currently flagged.",
        ],
      },
      {
        id: "risk",
        title: "Payment risk",
        verified: [
          { label: "Pending", value: String(facts.pendingInstallmentCount) },
          { label: "Approaching", value: String(facts.approachingCount) },
        ],
        insights: attention.length ? attention : ["No members currently require installment follow-up."],
        link: "members",
        linkLabel: "View members",
      },
      {
        id: "auction",
        title: "Auction insights",
        verified: facts.auctionInsights.slice(0, 3).map(row => ({
          label: row.name,
          value: row.latestBid == null ? "No bid yet" : money(row.latestBid),
        })),
        insights: auctionInsights,
      },
      {
        id: "fixed",
        title: "Fixed chit insights",
        verified: facts.fixedInsights.slice(0, 3).map(row => ({
          label: row.name,
          value: row.liftAmount == null ? row.currentMonth : money(row.liftAmount),
        })),
        insights: fixedInsights.length ? fixedInsights : ["No fixed chit schemes are currently active."],
      },
      ...(facts.predefinedInsights.length ? [{
        id: "predefined",
        title: "Fixed predefined bid insights",
        verified: facts.predefinedInsights.slice(0, 3).map(row => ({
          label: row.name,
          value: row.bidAmount == null ? row.currentMonth : money(row.bidAmount),
        })),
        insights: predefinedInsights,
      }] : []),
    ],
    alerts: [
      facts.pendingInstallmentCount ? `${facts.pendingInstallmentCount} members have pending installments.` : null,
      facts.largestOutstanding ? `${facts.largestOutstanding.name} has ${money(facts.largestOutstanding.amount)} outstanding.` : null,
      facts.approachingCount ? `${facts.approachingCount} members are approaching their next installment date.` : null,
    ].filter(Boolean),
    disclaimer: "Verified amounts come from Chit Fund schemes, recorded bids/lifts, and installment dues. Insights are advisory and do not change bids, installments, or dividends.",
  };
}

export function buildChitIntelligence(input) {
  const facts = buildChitFacts(input);
  return { facts, report: interpretChitFacts(facts) };
}
