import { chromium } from "@playwright/test";
import { mockAccountsWorkspace } from "../e2e/fixtures/accountsMocks.js";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await mockAccountsWorkspace(page);
let sent = null;
await page.route("**/api/accounts/bill-scan", async route => {
  sent = JSON.parse(route.request().postData() || "{}");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      bill: {
        supplierName: "City Supplies",
        supplierGstin: "",
        billNumber: "PDF-1",
        billDate: "2026-09-12",
        paymentStatus: "unpaid",
        documentKind: "invoice",
        lines: [{ name: "Paint", quantity: 1, rate: 100, gstRate: 18 }],
        taxable: 100,
        cgst: 9,
        sgst: 9,
        total: 118,
      },
    }),
  });
});

await page.goto("http://127.0.0.1:4193/accounting/transactions", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "+ Purchase" }).first().click();
const input = page.locator(".acc-bill-scan input[type=file]");
const accept = await input.getAttribute("accept");
if (!accept.includes("application/pdf")) throw new Error(`accept is ${accept}`);
const copy = await page.locator(".acc-bill-scan").innerText();
if (!copy.includes("or choose a PDF")) throw new Error(copy);

await input.setInputFiles({
  name: "supplier-bill.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"),
});
await page.getByText("PDF-1").waitFor({ timeout: 10000 });
if (sent?.mimeType !== "application/pdf") throw new Error(`mime ${sent?.mimeType}`);
if (!String(sent?.data || "").includes("JVBERi")) throw new Error("pdf bytes were not sent");
const shown = await page.locator(".acc-bill-scan").innerText();
if (!shown.includes("supplier-bill.pdf")) throw new Error(shown);
if (shown.includes("Could not read")) throw new Error(shown);

await input.setInputFiles({
  name: "notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("not a bill"),
});
await page.getByRole("alert").waitFor();
const alert = await page.getByRole("alert").innerText();
if (!alert.includes("JPEG or PNG")) throw new Error(alert);

await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => {
  const node = document.querySelector(".acc-bill-scan");
  return node.scrollWidth > node.clientWidth + 2;
});
if (overflow) throw new Error("bill scan overflow");
console.log("pdf bill scan ok");
await browser.close();
