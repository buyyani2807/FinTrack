import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://127.0.0.1:4175/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  const app = document.querySelector(".app");
  const style = app.querySelector("style");
  app.replaceChildren(style);
  app.insertAdjacentHTML("beforeend", `
    <main class="shell dashboard-home" style="background:var(--ft-bg);min-height:100vh;padding:24px">
      <section class="accounts-summary">
        <div class="accounts-summary-heading"><strong>Cashbook</strong><button type="button" class="link-button">Open</button></div>
        <div class="accounts-balance-strip">
          <button type="button" class="accounts-balance-item"><span>Cash on hand</span><strong class="gold">₹-27,64,100</strong></button>
          <button type="button" class="accounts-balance-item"><span>Bank balance</span><strong>₹24,00,500</strong></button>
          <button type="button" class="accounts-balance-item"><span>UPI balance</span><strong>₹15,85,004</strong></button>
          <button type="button" class="accounts-balance-item"><span>All money</span><strong class="gold">₹12,01,404</strong></button>
          <button type="button" class="accounts-balance-item accounts-balance-move"><span>Today in</span><strong class="green">₹0</strong></button>
          <button type="button" class="accounts-balance-item accounts-balance-move"><span>Today out</span><strong class="red">₹0</strong></button>
        </div>
      </section>
    </main>`);
});
await page.screenshot({ path: ".tmp/dash-cash-desktop.png" });
await page.setViewportSize({ width: 390, height: 800 });
await page.screenshot({ path: ".tmp/dash-cash-mobile.png" });
await browser.close();
console.log("ok");
