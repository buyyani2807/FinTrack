import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1280), height: 900 } });
await page.goto("http://127.0.0.1:5175/about", { waitUntil: "networkidle" });
for (const [name, sel] of [["team", ".mkt-team"], ["signins", ".mkt-about-signins"], ["principles", ".mkt-grid.four"]]) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await el.screenshot({ path: `.tmp/site-check/about-${process.env.TAG || ""}${name}.png` });
}
console.log(await page.evaluate(() => { const i = document.querySelector(".mkt-team img"); const r = i.getBoundingClientRect(); return { complete: i.complete, nw: i.naturalWidth, w: r.width, h: r.height }; }));
await browser.close();
