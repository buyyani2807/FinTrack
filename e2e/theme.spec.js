import { test, expect } from "@playwright/test";
import { mockAccountsWorkspace } from "./fixtures/accountsMocks.js";

test.describe("Theme", () => {
  test("follows the system setting until the toggle is used", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("sign-in has no theme toggle", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Financier sign in" })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("the sidebar toggle switches theme and remembers the choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mockAccountsWorkspace(page);
    await page.goto("/dashboard");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    const toggle = page.getByRole("complementary", { name: "Workspace" }).getByRole("switch", { name: "Switch to dark theme" });
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("switch", { name: "Switch to light theme" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("switch", { name: "Switch to light theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});
