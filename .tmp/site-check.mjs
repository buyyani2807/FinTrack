// Capture-only: screenshot public website pages (never committed).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE || "http://127.0.0.1:5175";
const out = process.env.OUT || ".tmp/site-check";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1280), height: Number(process.env.VH || 900) } });
const errors = [];
page.on("pageerror", err => errors.push(String(err.message || err)));
page.on("response", res => { if (res.url().includes("/product/") && res.status() >= 400) errors.push(`${res.status()} ${res.url()}`); });

const PAGES = process.env.PAGES ? JSON.parse(process.env.PAGES) : [
  ["bookkeeper", "/features/ai-bookkeeper"],
  ["setup", "/features/ai-setup"],
  ["migration", "/features/ai-migration"],
  ["home-ai", "/", "Tell FinTrack"],
  ["features", "/features", "Move from Tally, Zoho, or Excel"],
];
for (const [name, path, text] of PAGES) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.locator("h1").first().waitFor({ timeout: 60000 });
  if (text) await page.getByText(text, { exact: false }).first().scrollIntoViewIfNeeded();
  const img = page.locator(".mkt-shot img").first();
  if (!text && await img.count()) {
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  if (process.env.DARK) await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.evaluate(async () => {
    const imgs = [...document.images];
    imgs.forEach(i => { i.loading = "eager"; });
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !text });
  console.log("saved", name, await page.locator("h1").first().innerText());
}
console.log(errors.length ? `errors: ${errors.join(" | ")}` : "no errors");
await browser.close();
