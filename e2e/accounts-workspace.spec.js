import { test, expect } from "@playwright/test";
import { mockAccountsWorkspace } from "./fixtures/accountsMocks.js";

const SECTIONS = [
  ["Transactions"], ["Documents"], ["Inventory"],
  ["Parties", "Party Ledger"], ["Parties", "Receivables"], ["Parties", "Payables"], ["Parties", "Collection routes"],
  ["Reports", "Day Book"], ["Reports", "GST"], ["Reports", "Ledger"], ["Reports", "Trial Balance"], ["Reports", "Accounting P&L"], ["Reports", "Balance Sheet"],
  ["Banking"], ["Setup"], ["More"],
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
    const tabs = page.getByRole("navigation", { name: "Accounts sections" });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    const subTabs = page.locator(".acc-subsection-nav");

    for (const [label, child] of SECTIONS) {
      await tabs.getByRole("button", { name: label, exact: true }).click();
      if (child) await subTabs.getByRole("button", { name: child, exact: true }).click();
      await expect(page.locator(".acc-panel").first()).toBeVisible();
      if (label === "Transactions") await expect(page.getByText("S-1", { exact: true })).toBeVisible();
    }

    await tabs.getByRole("button", { name: "Reports", exact: true }).click();
    await subTabs.getByRole("button", { name: "Day Book", exact: true }).click();
    for (const tab of await page.locator(".accounts-section-tab").allTextContents()) {
      await page.locator(".accounts-section-tab", { hasText: tab }).first().click();
    }

    await tabs.getByRole("button", { name: "Inventory", exact: true }).click();
    for (const tab of await page.locator(".acc-panel .accounts-section-tab").allTextContents()) {
      await page.locator(".acc-panel .accounts-section-tab", { hasText: tab }).first().click();
    }

    expect(errors).toEqual([]);
  });

  test("entry, voucher, party and item dialogs open", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await page.goto("/accounting");
    const tabs = page.getByRole("navigation", { name: "Accounts sections" });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    const dialog = page.locator(".modal-bg").last();
    const closeDialog = () => dialog.getByRole("button", { name: "Close", exact: true }).first().click();

    const openNew = () => page.getByRole("button", { name: "New", exact: true }).click();
    for (const kind of ["Sale", "Purchase", "Expense", "Receipt", "Payment", "Credit note", "Debit note", "Transfer"]) {
      await openNew();
      await page.getByRole("menuitem", { name: kind, exact: true }).click();
      await expect(dialog).toBeVisible();
      await closeDialog();
    }
    await openNew();
    await page.getByRole("menuitem", { name: "Advanced voucher", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Post voucher" })).toBeVisible();
    await closeDialog();
    await openNew();
    await page.getByRole("menuitem", { name: "Party", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Add party" })).toBeVisible();
    await closeDialog();

    await tabs.getByRole("button", { name: "Transactions", exact: true }).click();
    await page.locator(".accounts-entry-row .acc-more-trigger").first().click();
    await page.getByRole("menuitem", { name: "Reverse", exact: true }).click();
    await expect(dialog.getByText("This is stored on the audit trail.")).toBeVisible();
    await closeDialog();

    await tabs.getByRole("button", { name: "Inventory", exact: true }).click();
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

test.describe("Back buttons", () => {
  test("owner pages rely on the sidebar instead of back-to-dashboard buttons", async ({ page }) => {
    await mockAccountsWorkspace(page);
    for (const path of ["/cashbook", "/chit-fund", "/settings", "/daily-finance/todays-collections"]) {
      await page.goto(path);
      await expect(page.getByRole("complementary", { name: "Workspace" })).toBeVisible({ timeout: 15_000 });
      await page.locator(".modal-bg").getByRole("button", { name: "Close" }).click({ timeout: 1500 }).catch(() => {});
      await expect(page.getByRole("button", { name: /^← (Dashboard|Back)$/ })).toHaveCount(0);
    }
  });
});

test.describe("Back button", () => {
  test("sub-pages show a Back button instead of breadcrumbs and it returns to the parent", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/daily-finance/todays-collections");
    const back = page.getByRole("button", { name: "Back", exact: true });
    await expect(back).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
    await back.click();
    await expect(page.getByRole("heading", { name: "Daily Finance", level: 1 })).toBeVisible();

    await page.goto("/daily-finance/accounts/fa1");
    await expect(page.getByRole("heading", { name: "Ravi Kumar", level: 1 })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Daily Finance", level: 1 })).toBeVisible();
  });
});

test.describe("Chit type", () => {
  test("the create-scheme form can switch type and keeps the shared details", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/chit-fund");
    await page.getByRole("button", { name: "+ New scheme" }).click({ timeout: 15_000 });
    await page.getByRole("button", { name: /Fixed Chit/ }).first().click();
    const types = page.getByRole("group", { name: "Chit type" });
    await expect(types.getByRole("button", { name: "Fixed" })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Scheme name *").fill("Diwali group");
    await types.getByRole("button", { name: "Auction" }).click();
    await expect(page.getByRole("heading", { name: "Create Auction Chit scheme" })).toBeVisible();
    await expect(page.getByLabel("Scheme name *")).toHaveValue("Diwali group");
    await types.getByRole("button", { name: "Predefined Bid" }).click();
    await expect(page.getByRole("heading", { name: "Create Fixed Predefined Bid Chit" })).toBeVisible();
    await expect(page.getByLabel("Scheme name *")).toHaveValue("Diwali group");
  });
});

test.describe("Accounts navigation", () => {
  test("keeps the workspace sidebar and shows sections as tabs with sub-tabs", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/accounting");
    const tabs = page.getByRole("navigation", { name: "Accounts sections" });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("complementary", { name: "Workspace" })).toBeVisible();
    await expect(page.locator(".acc-sidebar")).toHaveCount(0);
    await expect(page.locator(".acc-subsection-nav")).toHaveCount(0);
    await tabs.getByRole("button", { name: "Reports", exact: true }).click();
    const reportPages = page.getByRole("navigation", { name: "Reports pages" });
    await expect(reportPages.locator('[aria-current="page"]')).toHaveText("Day Book");
    await reportPages.getByRole("button", { name: "Trial Balance", exact: true }).click();
    await expect(reportPages.locator('[aria-current="page"]')).toHaveText("Trial Balance");
    await expect(tabs.getByRole("button", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "true");
  });
});

test.describe("Collection Staff", () => {
  test("is a sidebar item and a full page with a staff detail view", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/dashboard");
    const sidebar = page.getByRole("complementary", { name: "Workspace" });
    await expect(sidebar.getByRole("button", { name: "Settings" })).toBeVisible({ timeout: 15_000 });
    await expect(sidebar.getByRole("button", { name: "More" })).toHaveCount(0);
    await sidebar.getByRole("button", { name: "Collection Staff" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Collection Staff" })).toBeVisible();
    await expect(page.locator(".modal-bg")).toHaveCount(0);
    await page.getByRole("button", { name: "View / Assign" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Suresh Agent" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Collection Staff" })).toBeVisible();
  });
});

test.describe("Phone navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the top bar menu opens the full navigation, including Logout", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/daily-finance");
    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu).toBeVisible({ timeout: 15_000 });
    const drawer = page.getByRole("complementary", { name: "Workspace" });
    await expect(drawer).toBeHidden();
    await menu.click();
    await expect(drawer.getByRole("button", { name: "Collection Staff" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Logout" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await menu.click();
    await drawer.getByRole("button", { name: "Chit Fund" }).click();
    await expect(page).toHaveURL(/\/chit-fund$/);
    await expect(drawer).toBeHidden();
  });
});

test.describe("Settings", () => {
  test("sections are tabs and the save bar shows unsaved changes", async ({ page }) => {
    await mockAccountsWorkspace(page);
    await page.goto("/settings");
    const tabs = page.getByRole("navigation", { name: "Settings sections" });
    await expect(tabs).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Phone", { exact: true }).fill("9876543210");
    await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
    await tabs.getByRole("button", { name: "WhatsApp messages" }).click();
    await page.locator(".settings-template summary").first().click();
    await expect(page.getByRole("textbox", { name: "Payment receipt", exact: true })).toBeVisible();
    await tabs.getByRole("button", { name: "Reminders" }).click();
    await expect(page.getByRole("switch", { name: /Daily Finance/ })).toBeChecked();
  });
});
