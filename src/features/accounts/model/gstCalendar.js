/** GST return due dates (standard statutory dates; government extensions are not tracked). */

// QRMP GSTR-3B is due on the 22nd for these state codes and on the 24th elsewhere.
const QRMP_22ND_STATES = new Set(["22", "23", "24", "25", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37"]);

export const GST_FREQUENCIES = [
  { id: "monthly", label: "Monthly (GSTR-1 + GSTR-3B)" },
  { id: "quarterly", label: "Quarterly (QRMP)" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = value => String(value).padStart(2, "0");

export const monthKey = iso => String(iso || "").slice(0, 7);

export function addMonths(key, delta) {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthRange(key) {
  const [year, month] = key.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${pad(last)}` };
}

export function monthLabel(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  return month ? `${MONTHS[month - 1]} ${year}` : "";
}

const isQuarterEnd = key => [3, 6, 9, 12].includes(Number(key.split("-")[1]));

export function quarterLabel(endKey) {
  const start = addMonths(endKey, -2);
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  return startYear === endYear
    ? `${MONTHS[startMonth - 1]}–${MONTHS[endMonth - 1]} ${endYear}`
    : `${MONTHS[startMonth - 1]} ${startYear}–${MONTHS[endMonth - 1]} ${endYear}`;
}

const dueIn = (periodKey, day) => `${addMonths(periodKey, 1)}-${pad(day)}`;

/** Returns that fall due for one tax period (the month the return covers). */
export function gstReturnsForPeriod(periodKey, { registration = "unregistered", frequency = "monthly", stateCode = "" } = {}) {
  if (registration === "composition") {
    if (!isQuarterEnd(periodKey)) return [];
    return [{ code: "CMP08", label: "CMP-08", period: periodKey, periodLabel: quarterLabel(periodKey), dueDate: dueIn(periodKey, 18) }];
  }
  if (registration !== "regular") return [];
  if (frequency === "quarterly") {
    if (!isQuarterEnd(periodKey)) {
      return [{ code: "PMT06", label: "PMT-06 tax payment", period: periodKey, periodLabel: monthLabel(periodKey), dueDate: dueIn(periodKey, 25) }];
    }
    const label = quarterLabel(periodKey);
    return [
      { code: "GSTR1", label: "GSTR-1", period: periodKey, periodLabel: label, dueDate: dueIn(periodKey, 13) },
      { code: "GSTR3B", label: "GSTR-3B", period: periodKey, periodLabel: label, dueDate: dueIn(periodKey, QRMP_22ND_STATES.has(String(stateCode)) ? 22 : 24) },
    ];
  }
  const label = monthLabel(periodKey);
  return [
    { code: "GSTR1", label: "GSTR-1", period: periodKey, periodLabel: label, dueDate: dueIn(periodKey, 11) },
    { code: "GSTR3B", label: "GSTR-3B", period: periodKey, periodLabel: label, dueDate: dueIn(periodKey, 20) },
  ];
}

export function daysBetweenIso(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/**
 * Filing status for recent periods. `filings` are { returnCode, period, filedOn } rows.
 * Only periods that end on or after `since` (books start) are considered.
 */
export function gstFilingSchedule({ today, registration, frequency = "monthly", stateCode = "", filings = [], since = "", lookbackMonths = 3 } = {}) {
  if (!today || (registration !== "regular" && registration !== "composition")) return { pending: [], next: null, all: [] };
  const filed = new Map((filings || []).map(row => [`${row.returnCode}:${row.period}`, row]));
  const current = monthKey(today);
  const all = [];
  for (let back = lookbackMonths; back >= 0; back -= 1) {
    const period = addMonths(current, -back);
    if (since && monthRange(period).to < since) continue;
    for (const item of gstReturnsForPeriod(period, { registration, frequency, stateCode })) {
      const record = filed.get(`${item.code}:${item.period}`) || null;
      const daysLeft = daysBetweenIso(today, item.dueDate);
      const periodEnded = monthRange(period).to < today;
      const status = record ? "filed" : daysLeft < 0 ? "overdue" : daysLeft <= 5 ? "due_soon" : "upcoming";
      all.push({ ...item, filedOn: record?.filedOn || "", reference: record?.reference || "", daysLeft, status, periodEnded });
    }
  }
  all.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.code.localeCompare(b.code));
  const pending = all.filter(item => item.status !== "filed" && item.periodEnded);
  const next = pending.length ? null : all.find(item => item.status !== "filed") || null;
  return { pending, next, all };
}

export function dueLabel(item) {
  if (!item) return "";
  if (item.status === "filed") return `Filed ${item.filedOn}`;
  if (item.daysLeft < 0) return `${Math.abs(item.daysLeft)} day${item.daysLeft === -1 ? "" : "s"} late`;
  if (item.daysLeft === 0) return "Due today";
  return `Due in ${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}`;
}

const FREQUENCY_KEY = "fintrack-gst-frequency";

export function readGstFrequency(companyId) {
  try {
    const value = localStorage.getItem(`${FREQUENCY_KEY}:${companyId || ""}`);
    return value === "quarterly" ? "quarterly" : "monthly";
  } catch {
    return "monthly";
  }
}

export function writeGstFrequency(companyId, value) {
  try { localStorage.setItem(`${FREQUENCY_KEY}:${companyId || ""}`, value === "quarterly" ? "quarterly" : "monthly"); } catch { /* ignore */ }
}
