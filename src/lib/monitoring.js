export function initMonitoring() {
  window.addEventListener("error", event => {
    console.error("[MyFinTracker]", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", event => {
    console.error("[MyFinTracker]", event.reason);
  });
}
