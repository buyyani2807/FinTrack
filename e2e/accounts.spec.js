import { test, expect } from "@playwright/test";

test.describe("Accounts stays behind login", () => {
  test("logged-out visitor does not reach Accounts books", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Financier sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open the books" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Receivables" })).toHaveCount(0);
    await expect(page.getByText("Chart of accounts")).toHaveCount(0);
  });
});
