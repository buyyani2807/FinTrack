// Applies the saved theme before first paint, or light when none is saved; src/lib/theme.js keeps it in sync afterwards.
// Loaded as a file because the Content-Security-Policy does not allow inline scripts.
(function () {
  var theme;
  try { theme = localStorage.getItem("fintrack-theme"); } catch { theme = null; }
  if (theme !== "light" && theme !== "dark") theme = "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (theme === "dark") document.querySelector('meta[name="theme-color"]').setAttribute("content", "#111315");
})();
