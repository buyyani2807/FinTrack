import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const json = body => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const items = Array.from({ length: 55 }, (_, index) => {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: `it${n}`, item_type: "product", name: `Pager Item ${n}`, sku: `SKU${n}`, category_id: null,
    unit: "Nos", description: "", selling_price: 10, purchase_price: 8, gst_rate: 0, hsn_sac: "",
    opening_stock: 40, opening_stock_date: "2026-04-01", opening_rate: 8, reorder_level: 0, is_active: true,
  };
});

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
await page.route("**/rest/v1/acc_items**", route => route.fulfill(json(items)));
await page.goto("http://127.0.0.1:4183/accounting/inventory", { waitUntil: "networkidle" });
await page.getByText("Showing 1–50 of 55 items").waitFor({ timeout: 15000 });
await page.getByText("₹17,600").first().waitFor();
if (await page.getByText("Pager Item 51", { exact: true }).count()) throw new Error("page 1 included item 51");
await page.getByRole("button", { name: "Next" }).click();
await page.getByText("Showing 51–55 of 55 items").waitFor();
await page.getByText("Pager Item 51", { exact: true }).waitFor();
if (await page.getByText("Pager Item 01", { exact: true }).count()) throw new Error("page 2 included item 01");
if (!(await page.getByText("₹17,600").count())) throw new Error("stock total disappeared on page 2");
if (await page.locator(".acc-pager").getByRole("button", { name: "Next" }).isEnabled()) throw new Error("Next stayed enabled on the last page");
await page.getByLabel("Search items").fill("Pager Item 51");
await page.getByText("Pager Item 51", { exact: true }).waitFor();
if (await page.locator(".acc-pager").count()) throw new Error("search still showed a pager");
if (!(await page.getByText("₹17,600").count())) throw new Error("stock total disappeared while searching");
await page.getByLabel("Search items").fill("");
await page.getByText("Showing 1–50 of 55 items").waitFor();
await page.setViewportSize({ width: 390, height: 800 });
await page.getByRole("button", { name: "Next" }).waitFor();
const pagesHidden = await page.locator(".acc-pager-pages").evaluate(node => getComputedStyle(node).display === "none");
if (!pagesHidden) throw new Error("page numbers stayed visible on mobile");
const overflow = await page.locator(".acc-pager").evaluate(node => node.scrollWidth > node.clientWidth + 1);
if (overflow) throw new Error("pager overflowed on mobile");
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto("http://127.0.0.1:4183/accounting/inventory/items", { waitUntil: "networkidle" });
await page.getByText("Showing 1–50 of 55 items").waitFor();
await page.locator(".acc-pager").getByRole("button", { name: "2", exact: true }).click();
await page.getByRole("button", { name: "Pager Item 51" }).waitFor();
await page.getByRole("button", { name: "Edit" }).first().click();
await page.getByRole("dialog", { name: "Edit item" }).waitFor();
console.log("pagination ok");
await browser.close();
