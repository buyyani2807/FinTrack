/** Lightweight product analytics — non-PII events only. */

const QUEUE_KEY = "fintrack_product_events_queue";

export function trackProductEvent(eventName, properties = {}) {
  try {
    const event = {
      name: String(eventName || "").slice(0, 80),
      properties: sanitizeProperties(properties),
      at: new Date().toISOString(),
    };
    if (!event.name) return;
    const queue = readQueue();
    queue.push(event);
    while (queue.length > 200) queue.shift();
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fintrack-product-event", { detail: event }));
    }
  } catch {
    /* analytics must never break product flows */
  }
}

function sanitizeProperties(properties) {
  const safe = {};
  for (const [key, value] of Object.entries(properties || {})) {
    if (/phone|aadhaar|pan|password|pin|gstin|token|secret/i.test(key)) continue;
    if (typeof value === "string") safe[key] = value.slice(0, 120);
    else if (typeof value === "number" || typeof value === "boolean") safe[key] = value;
  }
  return safe;
}

function readQueue() {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function drainProductEvents() {
  const queue = readQueue();
  sessionStorage.removeItem(QUEUE_KEY);
  return queue;
}
