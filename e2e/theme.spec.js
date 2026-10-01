import { test, expect } from "@playwright/test";

test.describe("Theme", () => {
  test("follows the system setting until the toggle is used", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("the header toggle switches theme and remembers the choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    const toggle = page.getByRole("switch", { name: "Switch to dark theme" });
    await expect(toggle).toHaveCount(1);
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByRole("switch", { name: "Switch to light theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});
