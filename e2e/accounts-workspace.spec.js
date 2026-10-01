import { test, expect } from "@playwright/test";
import { mockAccountsWorkspace } from "./fixtures/accountsMocks.js";

const SECTIONS = [
  ["Transactions"], ["Documents"], ["Inventory"],
  ["Parties", "Party Ledger"], ["Parties", "Receivables"], ["Parties", "Payables"], ["Parties", "Collection routes"],
  ["Reports", "Day Book"], ["Reports", "GST"], ["Reports", "Ledger"], ["Reports", "Trial Balance"], ["Reports", "Profit & Loss"], ["Reports", "Balance Sheet"],
  ["Banking"], ["Setup"],
];

const trackErrors = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
};

test.describe("Accounts workspace", () => {
  test("every section, report tab and inventory tab renders without runtime errors", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await page.goto("/accounting");
    const sidebar = page.locator(".acc-sidebar");
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    for (const [label, child] of SECTIONS) {
      await sidebar.getByRole("button", { name: label, exact: true }).first().click();
      if (child) await sidebar.getByRole("button", { name: child, exact: true }).click();
      await expect(page.locator(".acc-panel").first()).toBeVisible();
      if (label === "Transactions") await expect(page.getByText("S-1", { exact: true })).toBeVisible();
    }

    await sidebar.getByRole("button", { name: "Reports", exact: true }).first().click();
    await sidebar.getByRole("button", { name: "Day Book", exact: true }).click();
    for (const tab of await page.locator(".accounts-section-tab").allTextContents()) {
      await page.locator(".accounts-section-tab", { hasText: tab }).first().click();
    }

    await sidebar.getByRole("button", { name: "Inventory", exact: true }).first().click();
    for (const tab of await page.locator(".acc-panel .accounts-section-tab").allTextContents()) {
      await page.locator(".acc-panel .accounts-section-tab", { hasText: tab }).first().click();
    }

    expect(errors).toEqual([]);
  });

  test("entry, voucher, party and item dialogs open", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await page.goto("/accounting");
    await expect(page.locator(".acc-sidebar")).toBeVisible({ timeout: 15_000 });
    const dialog = page.locator(".modal-bg").last();
    const closeDialog = () => dialog.getByRole("button", { name: "Close", exact: true }).first().click();

    for (const kind of ["sale", "purchase", "expense", "receipt", "payment", "credit_note", "debit_note", "transfer"]) {
      await page.locator("select.acc-new-entry").selectOption(kind);
      await expect(dialog).toBeVisible();
      await closeDialog();
    }
    await page.getByRole("button", { name: "+ Voucher" }).click();
    await expect(dialog.getByRole("heading", { name: "Post voucher" })).toBeVisible();
    await closeDialog();
    await page.getByRole("button", { name: "+ Party" }).click();
    await expect(dialog.getByRole("heading", { name: "Add party" })).toBeVisible();
    await closeDialog();

    await page.locator(".acc-sidebar").getByRole("button", { name: "Transactions", exact: true }).click();
    await page.locator(".accounts-entry-row .acc-more-trigger").first().click();
    await page.getByRole("menuitem", { name: "Reverse", exact: true }).click();
    await expect(dialog.getByText("This is stored on the audit trail.")).toBeVisible();
    await closeDialog();

    await page.locator(".acc-sidebar").getByRole("button", { name: "Inventory", exact: true }).click();
    await page.locator(".acc-panel").getByRole("button", { name: "Items", exact: true }).click();
    await page.getByRole("button", { name: "Basmati Rice 25kg", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Basmati Rice 25kg" })).toBeVisible();
    await closeDialog();

    expect(errors).toEqual([]);
  });
});

test.describe("Cashbook workspace", () => {
  test("every tab renders without runtime errors", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await page.goto("/cashbook");
    await expect(page.locator(".accounts-module")).toBeVisible({ timeout: 15_000 });
    // first visit asks for opening balances
    const setup = page.locator(".modal-bg");
    await setup.waitFor({ timeout: 5_000 }).then(() => setup.getByRole("button", { name: "Close", exact: true }).click(), () => {});
    await expect(setup).toHaveCount(0);
    await expect(page.getByText("Counter sales").first()).toBeVisible();

    const tabs = page.locator(".accounts-section-nav .accounts-section-tab");
    for (const tab of await tabs.allTextContents()) {
      await tabs.filter({ hasText: tab }).first().click();
      await expect(page.locator(".accounts-panel").first()).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});

test.describe("Workspace sidebar", () => {
  test("Logout in the sidebar signs the owner out", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.route("**/api/auth/logout", route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.goto("/dashboard");
    const sidebar = page.getByRole("complementary", { name: "Workspace" });
    await expect(sidebar).toBeVisible({ timeout: 15_000 });
    await sidebar.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("button", { name: "Financier sign in" })).toBeVisible();
  });
});

test.describe("Daily Finance tabs", () => {
  test("Overview, Customers and Reports keep the same page frame", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/daily-finance");
    const tabs = page.getByRole("navigation", { name: "Module sections" });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    for (const tab of ["Customers", "Reports", "Overview"]) {
      await tabs.getByRole("button", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: "Daily Finance", level: 1 })).toBeVisible();
      await expect(tabs.getByRole("button", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("button", { name: "Today’s collections" })).toBeVisible();
    }
  });
});
