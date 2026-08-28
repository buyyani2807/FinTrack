import { test, expect } from "@playwright/test";

test.describe("FinTrack login hub", () => {
  test("renders financier and customer login tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("FinTrack").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Financier sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agent login" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Customer login" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chit customer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create business account" })).toBeVisible();
  });

  test("shows privacy and terms links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Privacy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Terms" })).toBeVisible();
  });

  test("opens customer login fields", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Customer login" }).click();
    await expect(page.getByText("Customer portal ID")).toBeVisible();
    await expect(page.getByText("6-digit PIN")).toBeVisible();
  });
});

test.describe("Legal pages", () => {
  test("privacy policy renders", async ({ page }) => {
    await page.goto("/?view=privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByText("Who we are")).toBeVisible();
  });

  test("terms of service renders", async ({ page }) => {
    await page.goto("/?view=terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByText("Service description")).toBeVisible();
  });
});
