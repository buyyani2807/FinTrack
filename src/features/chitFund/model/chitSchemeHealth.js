import { calculateDividend, roundMoney } from "./calculations.js";
import { CHIT_TYPES } from "./fixedChit.js";
import { chitPaymentAmounts, chitPaymentIsDue } from "./memberPayments.js";

const DAY = 86400000;
const iso = value => String(value || "").slice(0, 10);
const daysBetween = (from, to) => {
  const a = new Date(`${iso(from)}T12:00:00Z`);
  const b = new Date(`${iso(to)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / DAY);
};
const addDays = (value, days) => {
  const date = new Date(`${iso(value)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const mean = list => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);
const sd = list => {
  if (list.length < 2) return 0;
  const m = mean(list);
  return Math.sqrt(list.reduce((sum, value) => sum + (value - m) ** 2, 0) / (list.length - 1));
};
const memberName = enrollment => enrollment?.chit_members?.full_name || enrollment?.member_name || "Member";

/** One normalised payment row per member per period, whatever the chit type. */
export function schemePaymentRows(scheme = {}, details = {}) {
  const type = scheme.chit_type || CHIT_TYPES.AUCTION;
  const cycleNumber = new Map((details.cycles || []).map(cycle => [cycle.id, Number(cycle.cycle_number)]));
  const source = type === CHIT_TYPES.FIXED
    ? (details.fixedPayments || []).map(row => ({ ...row, period: Number(row.payment_month) }))
    : type === CHIT_TYPES.FIXED_PREDEFINED_BID
      ? (details.predefinedPayments || []).map(row => ({ ...row, period: Number(row.payment_month) }))
      : (details.installments || []).map(row => ({ ...row, period: cycleNumber.get(row.cycle_id) || Number(row.payment_month) || 0 }));
  return source
    .filter(row => row.status !== "waived")
    .map(row => {
      const amounts = chitPaymentAmounts(row);
      return {
        id: row.id,
        enrollmentId: row.enrollment_id,
        period: row.period,
        dueDate: iso(row.due_date),
        paidDate: iso(row.paid_date),
        expected: amounts.expected,
        paid: amounts.paid,
        balance: amounts.balance,
        raw: row,
      };
    });
}

const delayFor = (row, today) => {
  if (!row.dueDate) return null;
  if (row.balance <= 0 && row.paidDate) return Math.max(0, daysBetween(row.dueDate, row.paidDate));
  if (row.balance > 0 && row.dueDate < today) return daysBetween(row.dueDate, today);
  return 0;
};

function expectedNextMonth(scheme, details, rows, today) {
  const windowEnd = addDays(today, 31);
  const scheduled = rows.filter(row => row.dueDate > today && row.dueDate <= windowEnd);
  if (scheduled.length) {
    return { amount: roundMoney(scheduled.reduce((sum, row) => sum + row.balance, 0)), basis: "Scheduled installments due in the next 31 days", estimated: false };
  }
  const members = (details.enrollments || []).filter(item => item.status === "active");
  if (!members.length || scheme.status !== "active") return { amount: 0, basis: "No active members", estimated: true };
  const type = scheme.chit_type || CHIT_TYPES.AUCTION;
  const lastPeriod = Math.max(0, ...rows.map(row => row.period));
  if (type === CHIT_TYPES.FIXED_PREDEFINED_BID) {
    const next = (details.predefinedSchedule || []).find(item => Number(item.month_number) === lastPeriod + 1);
    if (!next) return { amount: 0, basis: "No schedule row for the next month", estimated: true };
    return { amount: roundMoney(Number(next.emi || 0) * members.length), basis: `Schedule EMI for month ${lastPeriod + 1} × ${members.length} members`, estimated: true };
  }
  if (type === CHIT_TYPES.FIXED) {
    const lifts = (details.fixedLifts || []).filter(item => item.status === "completed");
    const amount = members.reduce((sum, member) => {
      const lift = lifts.find(item => item.enrollment_id === member.id);
      return sum + Number(lift ? lift.monthly_payment || scheme.installment_amount : scheme.installment_amount || 0);
    }, 0);
    return { amount: roundMoney(amount), basis: `Monthly installment for ${members.length} members`, estimated: true };
  }
  const lastCycle = [...(details.cycles || [])].sort((a, b) => Number(b.cycle_number) - Number(a.cycle_number))[0];
  const dividend = Number(lastCycle?.dividend_per_member || 0);
  return {
    amount: roundMoney(Math.max(0, Number(scheme.installment_amount || 0) - dividend) * members.length),
    basis: `Installment less last dividend (${roundMoney(dividend)}) × ${members.length} members`,
    estimated: true,
  };
}

function insight(base) {
  return { severity: "low", confidence: "medium", ...base, advisory: true, writeAction: "none" };
}

/**
 * Read-only Scheme Health for one chit scheme. Uses the scheme's saved payments, cycles, bids, lifts, and
 * schedule. It never changes auctions, winners, dividends, commissions, or payments; anomalies are only
 * raised with the stored evidence attached.
 */
export function buildChitSchemeHealth({ scheme, details = {}, asOf } = {}) {
  const today = iso(asOf);
  if (!scheme) return { available: false, reason: "Choose a scheme." };
  const enrollmentById = new Map((details.enrollments || []).map(item => [item.id, item]));
  const rows = schemePaymentRows(scheme, details);
  const due = rows.filter(row => chitPaymentIsDue(row.raw, today));
  const expectedDue = roundMoney(due.reduce((sum, row) => sum + row.expected, 0));
  const collectedDue = roundMoney(due.reduce((sum, row) => sum + Math.min(row.paid, row.expected), 0));
  const collectionRate = expectedDue > 0 ? roundMoney(collectedDue / expectedDue * 100) : null;
  const overdueRows = due.filter(row => row.balance > 0 && row.dueDate && row.dueDate < today);
  const overdueAmount = roundMoney(overdueRows.reduce((sum, row) => sum + row.balance, 0));
  const periods = [...new Set(due.map(row => row.period))].sort((a, b) => a - b);
  const insufficientHistory = periods.length < 2;
  const sourceLink = { schemeId: scheme.id, label: "Open scheme payments" };
  const insights = [];

  const byMember = new Map();
  for (const row of due) {
    if (!byMember.has(row.enrollmentId)) byMember.set(row.enrollmentId, []);
    byMember.get(row.enrollmentId).push(row);
  }
  const increasing = [];
  const likelyMiss = [];
  for (const [enrollmentId, list] of byMember) {
    const ordered = [...list].sort((a, b) => a.period - b.period);
    const delays = ordered.map(row => delayFor(row, today)).filter(value => value != null);
    const lastThree = delays.slice(-3);
    const name = memberName(enrollmentById.get(enrollmentId));
    if (lastThree.length === 3 && lastThree[0] < lastThree[1] && lastThree[1] < lastThree[2] && lastThree[2] > 3) {
      increasing.push({ enrollmentId, name, delays: lastThree, periods: ordered.slice(-3).map(row => row.period) });
    }
    const unpaid = ordered.filter(row => row.balance > 0 && row.dueDate < today).length;
    const lateRecent = lastThree.filter(value => value > 7).length;
    if (unpaid >= 1 || lateRecent >= 2) likelyMiss.push({ enrollmentId, name, unpaidPeriods: unpaid, lateRecent });
  }

  if (increasing.length) {
    insights.push(insight({
      id: `chit-${scheme.id}-delay-trend`,
      type: "delay_trend",
      title: `${increasing.length} member(s) with increasing payment delays`,
      severity: increasing.length >= 3 ? "high" : "medium",
      metrics: { members: increasing.length },
      affected: increasing.map(item => `${item.name} (months ${item.periods.join(", ")}: ${item.delays.join(" → ")} days)`),
      explanation: "Each member's delay grew across their last three due months.",
      confidence: "high",
      reviewAction: "Call these members before the next due date.",
      source: sourceLink,
    }));
  }
  if (likelyMiss.length) {
    insights.push(insight({
      id: `chit-${scheme.id}-likely-miss`,
      type: "likely_miss",
      title: `${likelyMiss.length} member(s) may miss the next payment`,
      severity: likelyMiss.length >= 3 ? "high" : "medium",
      metrics: { members: likelyMiss.length },
      affected: likelyMiss.map(item => `${item.name}${item.unpaidPeriods ? ` · ${item.unpaidPeriods} unpaid month(s)` : ""}${item.lateRecent ? ` · ${item.lateRecent} late of last 3` : ""}`),
      explanation: "Based on unpaid past-due months or two or more payments more than 7 days late in the last three months.",
      confidence: likelyMiss.some(item => item.unpaidPeriods) ? "high" : "medium",
      reviewAction: "Send a reminder and confirm the payment date.",
      source: sourceLink,
    }));
  }
  if (overdueRows.length) {
    insights.push(insight({
      id: `chit-${scheme.id}-overdue`,
      type: "overdue",
      title: `${new Set(overdueRows.map(row => row.enrollmentId)).size} member(s) overdue`,
      severity: overdueAmount >= Number(scheme.installment_amount || 0) * 3 ? "high" : "medium",
      metrics: { overdueAmount, installments: overdueRows.length },
      affected: [...new Set(overdueRows.map(row => memberName(enrollmentById.get(row.enrollmentId))))],
      explanation: `Past-due balance of ₹${overdueAmount.toLocaleString("en-IN")} across ${overdueRows.length} installment(s). Future months are not counted.`,
      confidence: "high",
      reviewAction: "Follow up on the oldest overdue months first.",
      source: sourceLink,
    }));
  }

  const recentPeriods = periods.slice(-3);
  const earlierPeriods = periods.slice(-6, -3);
  const rateFor = list => {
    const scoped = due.filter(row => list.includes(row.period));
    const expected = scoped.reduce((sum, row) => sum + row.expected, 0);
    return expected > 0 ? roundMoney(scoped.reduce((sum, row) => sum + Math.min(row.paid, row.expected), 0) / expected * 100) : null;
  };
  const recentRate = recentPeriods.length ? rateFor(recentPeriods) : null;
  const earlierRate = earlierPeriods.length >= 2 ? rateFor(earlierPeriods) : null;
  if (recentRate != null && earlierRate != null && earlierRate - recentRate >= 10) {
    insights.push(insight({
      id: `chit-${scheme.id}-collection-gap`,
      type: "collection_gap",
      title: "Collection rate has dropped",
      severity: earlierRate - recentRate >= 25 ? "high" : "medium",
      metrics: { recentRate, earlierRate },
      affected: recentPeriods.map(period => `Month ${period}`),
      explanation: `Months ${recentPeriods.join(", ")} collected ${recentRate}% vs ${earlierRate}% in months ${earlierPeriods.join(", ")}.`,
      confidence: "medium",
      reviewAction: "Review the members unpaid in the recent months.",
      source: sourceLink,
    }));
  }

  const cycles = [...(details.cycles || [])].filter(cycle => Number(cycle.winning_bid_amount) > 0).sort((a, b) => Number(a.cycle_number) - Number(b.cycle_number));
  if ((scheme.chit_type || CHIT_TYPES.AUCTION) === CHIT_TYPES.AUCTION) {
    for (const cycle of cycles) {
      const prior = cycles.filter(item => Number(item.cycle_number) < Number(cycle.cycle_number)).map(item => Number(item.winning_bid_amount));
      if (prior.length < 4) continue;
      const m = mean(prior);
      const s = sd(prior);
      const value = Number(cycle.winning_bid_amount);
      if (!(s > 0) || Math.abs(value - m) / s < 2) continue;
      insights.push(insight({
        id: `chit-${scheme.id}-bid-${cycle.cycle_number}`,
        type: "unusual_bidding",
        title: `Unusual bidding in month ${cycle.cycle_number}`,
        severity: "medium",
        metrics: { liftAmount: value, averageLift: roundMoney(m) },
        affected: [`Month ${cycle.cycle_number}`],
        explanation: `Lift amount ₹${roundMoney(value).toLocaleString("en-IN")} is far from the ₹${roundMoney(m).toLocaleString("en-IN")} average of ${prior.length} earlier months.`,
        confidence: prior.length >= 6 ? "high" : "medium",
        reviewAction: "Check the bid sheet for this month.",
        source: sourceLink,
      }));
    }
    const bidsByCycle = new Map();
    for (const bid of details.bids || []) bidsByCycle.set(bid.cycle_id, (bidsByCycle.get(bid.cycle_id) || new Set()).add(bid.enrollment_id));
    const counts = cycles.map(cycle => ({ cycle, bidders: bidsByCycle.get(cycle.id)?.size || 0 })).filter(item => item.bidders > 0);
    if (counts.length >= 4) {
      const usual = mean(counts.slice(0, -1).map(item => item.bidders));
      const last = counts.at(-1);
      if (usual >= 3 && last.bidders <= usual / 2) {
        insights.push(insight({
          id: `chit-${scheme.id}-participation-${last.cycle.cycle_number}`,
          type: "participation",
          title: `Lower bidding participation in month ${last.cycle.cycle_number}`,
          severity: "low",
          metrics: { bidders: last.bidders, usualBidders: roundMoney(usual) },
          affected: [`Month ${last.cycle.cycle_number}`],
          explanation: `${last.bidders} member(s) bid vs about ${roundMoney(usual)} usually.`,
          confidence: "medium",
          reviewAction: "Confirm members were informed of the auction date.",
          source: sourceLink,
        }));
      }
    }
    for (const cycle of cycles) {
      let expected;
      try {
        expected = calculateDividend({
          chitValue: scheme.chit_value,
          winningBidAmount: cycle.winning_bid_amount,
          commissionPercent: scheme.commission_percent,
          totalMembers: scheme.member_count,
        });
      } catch {
        continue;
      }
      const stored = Number(cycle.dividend_per_member);
      if (!Number.isFinite(stored) || Math.abs(stored - expected.dividendPerMember) <= 0.01) continue;
      insights.push(insight({
        id: `chit-${scheme.id}-dividend-${cycle.cycle_number}`,
        type: "dividend_anomaly",
        title: `Dividend for month ${cycle.cycle_number} requires review`,
        severity: "high",
        metrics: { storedDividend: stored, recalculatedDividend: expected.dividendPerMember },
        affected: [`Month ${cycle.cycle_number}`],
        explanation: `Saved dividend ₹${stored} differs from ₹${expected.dividendPerMember} using the scheme's chit value, commission, and member count. The saved value was not changed.`,
        confidence: "high",
        reviewAction: "Check whether the scheme settings changed after this month was recorded.",
        source: sourceLink,
      }));
    }
  }

  const commissionEarned = roundMoney((details.cycles || []).reduce((sum, cycle) => sum + Number(cycle.commission_amount || 0), 0));
  const next = expectedNextMonth(scheme, details, rows, today);
  const riskScore = (collectionRate != null && collectionRate < 80 ? 2 : collectionRate != null && collectionRate < 95 ? 1 : 0)
    + (increasing.length ? 1 : 0)
    + (likelyMiss.length >= 3 ? 2 : likelyMiss.length ? 1 : 0)
    + (insights.some(item => item.type === "dividend_anomaly") ? 2 : 0);
  const risk = insufficientHistory ? "insufficient" : riskScore >= 4 ? "high" : riskScore >= 2 ? "medium" : "low";

  return {
    available: true,
    schemeId: scheme.id,
    schemeName: scheme.name,
    period: { from: due.reduce((min, row) => (!min || (row.dueDate && row.dueDate < min) ? row.dueDate : min), ""), to: today },
    asOf: today,
    insufficientHistory,
    collectionRate,
    expectedDue,
    collectedDue,
    overdueAmount,
    overdueMembers: new Set(overdueRows.map(row => row.enrollmentId)).size,
    increasingDelayMembers: increasing.length,
    likelyMissMembers: likelyMiss.length,
    expectedNextMonth: next,
    commissionEarned,
    recentRate,
    earlierRate,
    risk,
    insights: insights.map(item => ({ ...item, scheme: scheme.name, period: item.period || `Up to ${today}` })),
    advisory: true,
    writeAction: "none",
  };
}
