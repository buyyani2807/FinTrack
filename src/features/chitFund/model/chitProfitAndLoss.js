const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function financialYearBounds(startYear) {
  const year = Number(startYear);
  if (!Number.isInteger(year) || year < 2000) return null;
  return { from: `${year}-04-01`, to: `${year + 1}-03-31`, label: `${year}-${String(year + 1).slice(-2)}` };
}

export function currentFinancialYearStart(today = "") {
  const date = String(today || new Date().toISOString()).slice(0, 10);
  const [year, month] = date.split("-").map(Number);
  if (!year || !month) return new Date().getFullYear();
  return month >= 4 ? year : year - 1;
}

function dateFits(date, from, to) {
  const value = String(date || "").slice(0, 10);
  if (!from && !to) return { ok: true, missing: false };
  if (!value) return { ok: false, missing: true };
  if (from && value < from) return { ok: false, missing: false };
  if (to && value > to) return { ok: false, missing: false };
  return { ok: true, missing: false };
}

function schemeAllowed(scheme, filters) {
  if (!scheme) return false;
  if (filters.schemeId && scheme.id !== filters.schemeId) return false;
  if (filters.chitType && (scheme.chit_type || "auction") !== filters.chitType) return false;
  if (filters.status && scheme.status !== filters.status) return false;
  return true;
}

function pushCommission(lines, insufficient, entry) {
  if (entry.amount == null || entry.amount === "" || !Number.isFinite(Number(entry.amount))) {
    insufficient.push({ schemeId: entry.schemeId, source: entry.chitType, id: entry.id, reason: "Commission is not stored on this record." });
    return;
  }
  lines.push({
    schemeId: entry.schemeId,
    chitType: entry.chitType,
    amount: roundMoney(entry.amount),
    date: String(entry.date || "").slice(0, 10),
    month: Number(entry.month || 0),
    dividend: entry.dividend == null || entry.dividend === "" ? null : roundMoney(entry.dividend),
  });
}

export function buildChitProfitAndLoss({
  schemes = [],
  cycles = [],
  fixedLifts = [],
  predefinedSchedule = [],
  filters = {},
} = {}) {
  const fy = financialYearBounds(filters.financialYear);
  const from = fy?.from || String(filters.from || "").slice(0, 10);
  const to = fy?.to || String(filters.to || "").slice(0, 10);
  const monthFilter = Number(filters.month || 0);
  const memberFilter = filters.memberId || "";
  const schemeById = new Map((schemes || []).map(scheme => [scheme.id, scheme]));
  const included = (schemes || []).filter(scheme => schemeAllowed(scheme, filters));
  const allowed = new Set(included.map(scheme => scheme.id));
  const lines = [];
  const insufficient = [];

  for (const cycle of cycles || []) {
    const scheme = schemeById.get(cycle.scheme_id);
    if (!scheme || !allowed.has(scheme.id) || (scheme.chit_type && scheme.chit_type !== "auction")) continue;
    if (monthFilter && Number(cycle.cycle_number) !== monthFilter) continue;
    if (memberFilter && cycle.winning_enrollment_id !== memberFilter) continue;
    if (cycle.status !== "settled" && cycle.status !== "auction_closed") continue;
    const cycleDate = dateFits(cycle.cycle_date, from, to);
    if (!cycleDate.ok) {
      if (cycleDate.missing) insufficient.push({ schemeId: scheme.id, source: "auction", id: cycle.id, reason: "This settled month has no date." });
      continue;
    }
    pushCommission(lines, insufficient, {
      schemeId: scheme.id,
      chitType: "auction",
      id: cycle.id,
      amount: cycle.commission_amount,
      date: cycle.cycle_date,
      month: cycle.cycle_number,
      dividend: cycle.distributable_amount,
    });
  }

  for (const lift of fixedLifts || []) {
    const scheme = schemeById.get(lift.scheme_id);
    if (!scheme || !allowed.has(scheme.id) || scheme.chit_type !== "fixed") continue;
    if (lift.status !== "completed") continue;
    if (monthFilter && Number(lift.month_number) !== monthFilter) continue;
    if (memberFilter && lift.enrollment_id !== memberFilter) continue;
    const liftDate = dateFits(lift.lift_date, from, to);
    if (!liftDate.ok) {
      if (liftDate.missing) insufficient.push({ schemeId: scheme.id, source: "fixed", id: lift.id, reason: "This completed lift has no date." });
      continue;
    }
    pushCommission(lines, insufficient, {
      schemeId: scheme.id,
      chitType: "fixed",
      id: lift.id,
      amount: lift.manager_commission,
      date: lift.lift_date,
      month: lift.month_number,
      dividend: null,
    });
  }

  for (const row of predefinedSchedule || []) {
    const scheme = schemeById.get(row.scheme_id);
    if (!scheme || !allowed.has(scheme.id) || scheme.chit_type !== "fixed_predefined_bid") continue;
    if (row.status !== "completed") continue;
    if (monthFilter && Number(row.month_number) !== monthFilter) continue;
    if (memberFilter && row.enrollment_id !== memberFilter) continue;
    const assigned = dateFits(row.assigned_date, from, to);
    if (!assigned.ok) {
      if (assigned.missing) insufficient.push({ schemeId: scheme.id, source: "fixed_predefined_bid", id: row.id, reason: "This completed month has no date." });
      continue;
    }
    pushCommission(lines, insufficient, {
      schemeId: scheme.id,
      chitType: "fixed_predefined_bid",
      id: row.id,
      amount: row.manager_commission,
      date: row.assigned_date,
      month: row.month_number,
      dividend: null,
    });
  }

  const schemeRows = included.map(scheme => {
    const schemeLines = lines.filter(line => line.schemeId === scheme.id);
    const missing = insufficient.filter(item => item.schemeId === scheme.id).length;
    return {
      schemeId: scheme.id,
      name: scheme.name || "Scheme",
      chitType: scheme.chit_type || "auction",
      commission: schemeLines.length ? roundMoney(schemeLines.reduce((sum, line) => sum + line.amount, 0)) : null,
      months: schemeLines.length,
      missing,
    };
  }).filter(row => row.months || row.missing);

  const dividendLines = lines.filter(line => line.chitType === "auction");
  const dividendKnown = dividendLines.filter(line => line.dividend != null);
  const gross = lines.length ? roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)) : null;

  return {
    from,
    to,
    grossIncome: gross == null ? { status: insufficient.length ? "insufficient" : "known", amount: insufficient.length ? null : 0 } : { status: "known", amount: gross },
    income: {
      commission: gross == null ? null : gross,
    },
    dividends: dividendLines.length
      ? {
        status: "memo",
        amount: dividendKnown.length ? roundMoney(dividendKnown.reduce((sum, line) => sum + line.dividend, 0)) : null,
        missing: dividendLines.length - dividendKnown.length,
        note: "Member dividends are already excluded from commission. They are not a company expense and are not deducted again.",
      }
      : { status: "unavailable", amount: null, missing: 0, note: "No settled auction month in this filter has a dividend record." },
    expenses: {
      status: "unavailable",
      amount: null,
      reason: "No Chit Fund expense ledger is recorded. Agent commission and operating expenses are not invented.",
    },
    net: {
      status: "unavailable",
      amount: null,
      reason: "Net profit needs recorded expenses. Commission income is shown separately and is not treated as net profit.",
    },
    schemes: schemeRows,
    insufficient,
    collections: {
      status: "unavailable",
      reason: "Collected and pending amounts stay on the month statement. This report does not invent collection totals.",
    },
  };
}
