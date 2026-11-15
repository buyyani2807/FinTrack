import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.goto("http://127.0.0.1:4179/accounting", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const style = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const button = document.querySelector(".btn");
  const card = document.querySelector(".card, .acc-metric-card, .accounts-balance-item");
  const buttonStyle = button ? getComputedStyle(button) : null;
  return {
    bg: root.getPropertyValue("--ft-bg").trim(),
    radius: root.getPropertyValue("--ft-radius").trim(),
    buttonRadius: buttonStyle?.borderRadius || "",
    cardBorder: card ? getComputedStyle(card).borderTopColor : "",
  };
});
console.log(JSON.stringify(style));
await page.screenshot({ path: ".tmp/design-accounts.png", fullPage: false });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: ".tmp/design-accounts-mobile.png", fullPage: false });
await browser.close();
