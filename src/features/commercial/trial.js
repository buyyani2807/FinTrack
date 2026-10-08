// Server timestamps decide the trial. Callers pass `serverNow` from Postgres.
// This module never reads the device clock or browser storage.

export const TRIAL_DAYS = 14;
export const TRIAL_ZONE = "Asia/Kolkata";
export const TRIAL_LENGTH_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: "₹499",
    period: "month",
    note: "All modules.",
  },
  {
    id: "annual",
    name: "Annual",
    price: "₹5,000",
    period: "year",
    note: "₹988 less than twelve monthly payments.",
  },
];

export function trialEndsFromStart(startedAtMs) {
  return Number(startedAtMs) + TRIAL_LENGTH_MS;
}

export function shouldStartTrial({ authUserCreated = false, workspaceCreated = false } = {}) {
  return Boolean(authUserCreated && workspaceCreated);
}

export function canRestartTrial(existingStartedAt) {
  return existingStartedAt == null && false;
}

export function kolkataDay(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TRIAL_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

export function calendarDaysRemaining(endsAt, serverNow) {
  const endDay = kolkataDay(endsAt);
  const nowDay = kolkataDay(serverNow);
  if (!endDay || !nowDay) return null;
  const end = Date.parse(`${endDay}T00:00:00Z`);
  const now = Date.parse(`${nowDay}T00:00:00Z`);
  return Math.round((end - now) / (24 * 60 * 60 * 1000));
}

export function formatTrialDate(iso) {
  const time = Date.parse(iso || "");
  if (Number.isNaN(time)) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TRIAL_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(time));
}

export function grandfatheredSubscription() {
  return {
    status: "active",
    plan: "legacy",
    provider: "",
    customerId: "",
    startedAt: "",
    endsAt: "",
    serverNow: "",
    daysRemaining: null,
    grandfathered: true,
    entitled: true,
    updatedAt: "",
  };
}

export function normalizeSubscription(payload) {
  const row = payload && typeof payload === "object" ? payload : {};
  if (row.grandfathered === true || row.status == null || row.status === "") {
    return {
      ...grandfatheredSubscription(),
      serverNow: row.serverNow || row.server_now || "",
    };
  }
  const endsAt = row.endsAt || row.ends_at || "";
  const serverNow = row.serverNow || row.server_now || "";
  const daysRemaining = Number.isInteger(row.daysRemaining)
    ? row.daysRemaining
    : Number.isInteger(row.days_remaining)
      ? row.days_remaining
      : calendarDaysRemaining(endsAt, serverNow);
  return {
    status: row.status,
    plan: row.plan || "",
    provider: row.provider || "",
    customerId: row.customerId || row.customer_id || "",
    startedAt: row.startedAt || row.started_at || "",
    endsAt,
    serverNow,
    daysRemaining,
    grandfathered: false,
    entitled: row.entitled !== false,
    updatedAt: row.updatedAt || row.updated_at || "",
  };
}

export function workspaceAccessAllowed(subscription) {
  if (!subscription || subscription.grandfathered) return true;
  const status = subscription.status || "";
  if (!status) return true;
  if (status === "active") return subscription.entitled !== false;
  if (status === "trialing") {
    if (subscription.entitled === false) return false;
    if (subscription.endsAt && subscription.serverNow) {
      return Date.parse(subscription.serverNow) < Date.parse(subscription.endsAt);
    }
    return subscription.entitled !== false;
  }
  return false;
}

export function resolveDaysRemaining(subscription) {
  if (!subscription || subscription.grandfathered) return null;
  if (Number.isInteger(subscription.daysRemaining)) return subscription.daysRemaining;
  if (subscription.endsAt && subscription.serverNow) {
    return calendarDaysRemaining(subscription.endsAt, subscription.serverNow);
  }
  return null;
}

export function trialBannerCopy(subscription) {
  if (!subscription || subscription.grandfathered || subscription.status !== "trialing") return null;
  if (!workspaceAccessAllowed(subscription)) return null;
  const days = resolveDaysRemaining(subscription);
  const endLabel = formatTrialDate(subscription.endsAt);
  const endText = endLabel ? ` Ends ${endLabel}.` : "";
  let detail = `Your 14-day free trial is active.${endText}`;
  let tone = "info";
  if (days === 0) {
    detail = `Trial expires today.${endText}`;
    tone = "urgent";
  } else if (days === 1) {
    detail = `1 day remaining.${endText}`;
    tone = "urgent";
  } else if (days === 3) {
    detail = `3 days remaining.${endText}`;
    tone = "warning";
  } else if (days === 7) {
    detail = `7 days remaining.${endText}`;
    tone = "warning";
  } else if (Number.isInteger(days)) {
    detail = `${days} days remaining.${endText}`;
    tone = days < 7 ? "warning" : "info";
  }
  return {
    title: "14-day free trial",
    detail: detail.trim(),
    tone,
    daysRemaining: days,
    action: "Choose a plan",
  };
}

export function subscriptionLockCopy(subscription) {
  if (workspaceAccessAllowed(subscription)) return null;
  const trialEnded = !subscription || subscription.status === "expired" || subscription.status === "trialing";
  return {
    title: trialEnded ? "Your 14-day free trial has ended" : "Choose a plan to keep recording",
    started: formatTrialDate(subscription?.startedAt),
    ended: formatTrialDate(subscription?.endsAt),
    preservation: "Your customers, collections, chit records, and accounts are still here. Nothing is deleted.",
  };
}

export function subscriptionPathAllowed(pathname, subscription) {
  if (workspaceAccessAllowed(subscription)) return true;
  const path = String(pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  return path === "/subscribe" || path === "/settings" || path.startsWith("/settings/");
}

export function moduleOpenDuringSubscription(subscription, moduleEnabled) {
  return workspaceAccessAllowed(subscription) && Boolean(moduleEnabled);
}

export function paidActivationFromButton() {
  return {
    accepted: false,
    activatesWorkspace: false,
    reason: "A verified payment-provider event is required. A button click does not mark this workspace as paid.",
  };
}
