// Client error tracking. Sentry loads only when VITE_SENTRY_DSN is set at build time;
// without it this file only logs to the console, as before.
//
// Privacy: this is a finance app. Nothing that identifies a customer leaves the browser:
// - sendDefaultPii is off (no IP, cookies or request headers);
// - every event is scrubbed of phone numbers, emails, PAN, Aadhaar, JWTs and
//   query strings (Supabase REST URLs carry filters such as phone=eq.…);
// - session replay and performance tracing are off;
// - the user is identified only by their internal id and role.

const PATTERNS = [
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[pan]"],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[aadhaar]"],
  [/(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, "[phone]"],
];

// Whole key names only: "pan" must not catch "company", "pin" must not catch "mapping".
const SECRET_KEY = /^(pin|new_?pin|input_pin|password|token|access_token|refresh_token|secret|authorization|cookie|aadhaar|pan|apikey)$/i;
const URL_KEY = /^(url|href|from|to)$/i;

export function scrubText(value) {
  if (typeof value !== "string" || !value) return value;
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function scrubUrl(value) {
  if (typeof value !== "string" || !value) return value;
  const cut = value.search(/[?#]/);
  return scrubText(cut === -1 ? value : value.slice(0, cut));
}

function scrubDeep(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(item => scrubDeep(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) out[key] = "[removed]";
      else if (URL_KEY.test(key) && typeof item === "string") out[key] = scrubUrl(item);
      else out[key] = scrubDeep(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** Applied to every Sentry event before it is sent. Exported for tests. */
export function scrubEvent(event) {
  if (!event) return event;
  const next = { ...event };
  delete next.user?.ip_address;
  delete next.user?.email;
  delete next.user?.username;
  if (next.request) {
    next.request = { url: scrubUrl(next.request.url) };
  }
  if (next.message) next.message = scrubText(next.message);
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map(item => ({ ...item, value: scrubText(item.value) })),
    };
  }
  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map(crumb => ({
      ...crumb,
      message: scrubText(crumb.message),
      data: scrubDeep(crumb.data),
    }));
  }
  if (next.extra) next.extra = scrubDeep(next.extra);
  if (next.contexts) next.contexts = scrubDeep(next.contexts);
  return next;
}

let sentry = null;
let pendingContext = null;

function environmentName() {
  const explicit = import.meta.env.VITE_SENTRY_ENVIRONMENT;
  if (explicit) return explicit;
  const host = typeof location !== "undefined" ? location.hostname : "";
  if (/staging/i.test(host)) return "staging";
  if (host === "localhost" || host === "127.0.0.1") return "development";
  return "production";
}

export function initMonitoring() {
  window.addEventListener("error", event => {
    console.error("[MyFinTracker]", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", event => {
    console.error("[MyFinTracker]", event.reason);
  });

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import("@sentry/react").then(Sentry => {
    Sentry.init({
      dsn,
      environment: environmentName(),
      release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend: scrubEvent,
      beforeBreadcrumb: crumb => {
        // Console breadcrumbs repeat app data; keep navigation and network shape only.
        if (crumb.category === "console") return null;
        return { ...crumb, message: scrubText(crumb.message), data: scrubDeep(crumb.data) };
      },
    });
    sentry = Sentry;
    if (pendingContext) setMonitoringContext(pendingContext);
  }).catch(error => console.warn("[MyFinTracker] Sentry did not load", error));
}

/** Tag errors with who hit them, without personal data. Call with null on sign-out. */
export function setMonitoringContext(context) {
  pendingContext = context;
  if (!sentry) return;
  if (!context?.userId) {
    sentry.setUser(null);
    sentry.setTag("role", "signed_out");
    return;
  }
  sentry.setUser({ id: context.userId });
  sentry.setTag("role", context.role || "unknown");
}

export function reportError(error, extra) {
  console.error("[MyFinTracker]", error);
  sentry?.captureException(error, extra ? { extra } : undefined);
}
