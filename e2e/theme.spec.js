import { test, expect } from "@playwright/test";
import { mockAccountsWorkspace } from "./fixtures/accountsMocks.js";

test.describe("Theme", () => {
  test("defaults to light even when the system prefers dark", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });

  test("the public site has no theme toggle", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".mkt-nav")).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("sign-in has no theme toggle", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Owner sign in" })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("a saved dark theme stays in the app and the public site stays light", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("fintrack-theme", "dark"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await mockAccountsWorkspace(page);
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("complementary", { name: "Workspace" }).getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("fintrack-theme"))).toBe("dark");
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
