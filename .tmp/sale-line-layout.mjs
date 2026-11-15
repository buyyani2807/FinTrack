import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const base = process.env.BASE || "http://127.0.0.1:5179";
const browser = await chromium.launch({ channel: "chrome" });

async function check(width, height, label) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", err => { throw err; });
  await mockAccountsWorkspace(page);
  await page.goto(`${base}/accounting`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New", exact: true }).click({ force: true });
  await page.getByRole("menuitem", { name: "Sale", exact: true }).click();
  const sale = page.getByRole("dialog", { name: "Sale" });
  await sale.locator(".acc-item-line-card").waitFor();
  const tableHidden = await sale.locator(".acc-item-lines .acc-table-wrap").evaluate(node => getComputedStyle(node).display === "none");
  if (!tableHidden) throw new Error(`${label}: line table is still shown`);
  const box = await sale.locator(".acc-item-lines").evaluate(node => ({
    scroll: node.scrollWidth,
    client: node.clientWidth,
    fields: [...node.querySelectorAll(".acc-item-line-card-grid .small")].map(item => item.textContent),
  }));
  if (box.scroll > box.client + 4) throw new Error(`${label}: line items scroll sideways ${box.scroll} > ${box.client}`);
  for (const name of ["Qty", "Rate", "Discount", "GST %"]) {
    if (!box.fields.includes(name)) throw new Error(`${label}: missing ${name}`);
    const field = sale.locator(".acc-item-line-card-grid").getByText(name, { exact: true });
    const visible = await field.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const parent = node.closest(".acc-item-lines").getBoundingClientRect();
      return rect.width > 0 && rect.left >= parent.left - 1 && rect.right <= parent.right + 1;
    });
    if (!visible) throw new Error(`${label}: ${name} is outside the line`);
  }
  console.log(label, "ok", box.fields.join(", "));
  await page.close();
}

await check(1280, 900, "desktop");
await check(390, 844, "phone");
console.log("sale line layout ok");
await browser.close();
