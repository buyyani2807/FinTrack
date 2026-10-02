// Applies the saved (or system) theme before first paint; src/lib/theme.js keeps it in sync afterwards.
// Loaded as a file because the Content-Security-Policy does not allow inline scripts.
(function () {
  var theme;
  try { theme = localStorage.getItem("fintrack-theme"); } catch { theme = null; }
  if (theme !== "light" && theme !== "dark") theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (theme === "dark") document.querySelector('meta[name="theme-color"]').setAttribute("content", "#111315");
})();
