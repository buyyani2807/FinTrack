// Applies the saved theme before first paint on signed-in app URLs, and light on the public site.
// Keep the path list in sync with isGuestThemePath in src/features/marketing/paths.js.
// Loaded as a file because the Content-Security-Policy does not allow inline scripts.
(function () {
  var path = (location.pathname || "/").replace(/\/+$/, "") || "/";
  var guestRoots = ["/features", "/solutions", "/how-it-works", "/security", "/pricing", "/about", "/founder", "/contact", "/login", "/pay"];
  var guest = path === "/" || guestRoots.some(function (root) {
    return path === root || path.indexOf(root + "/") === 0;
  });
  var theme = "light";
  if (!guest) {
    try { theme = localStorage.getItem("fintrack-theme"); } catch (error) { theme = null; }
    if (theme !== "light" && theme !== "dark") theme = "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (theme === "dark") {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#111315");
  }
})();
