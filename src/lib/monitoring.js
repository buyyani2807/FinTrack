export function initMonitoring() {
  window.addEventListener("error", event => {
    console.error("[FinTrack]", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", event => {
    console.error("[FinTrack]", event.reason);
  });
}
