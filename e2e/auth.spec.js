import { test, expect } from "@playwright/test";

test.describe("Login hub tabs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("financier sign in shows business email and password", async ({ page }) => {
    await page.getByRole("button", { name: "Financier sign in" }).click();
    await expect(page.getByText("Business email")).toBeVisible();
    await expect(page.getByText("Password").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();
  });

  test("agent login shows agent ID and PIN", async ({ page }) => {
    await page.getByRole("button", { name: "Agent login" }).click();
    await expect(page.getByText("Agent ID")).toBeVisible();
    await expect(page.getByLabel("6-digit PIN")).toBeVisible();
    await expect(page.getByText("Collection Agent workspace")).toBeVisible();
    await expect(page.getByText(/starts with AG-/)).toBeVisible();
  });

  test("chit customer login shows portal ID field", async ({ page }) => {
    await page.getByRole("button", { name: "Chit customer" }).click();
    await expect(page.getByText("Chit portal ID")).toBeVisible();
    await expect(page.getByLabel("6-digit PIN")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open chit dashboard" })).toBeVisible();
  });

  test("create business account shows signup fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create business account" }).click();
    await expect(page.getByText("Business name")).toBeVisible();
    await expect(page.getByText("Your full name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create business account" }).last()).toBeVisible();
  });
});

test.describe("Login validation (client-side)", () => {
  test("empty financier sign in shows an error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/enter|required|unable/i)).toBeVisible();
  });

  test("empty customer login shows portal ID error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Customer login" }).click();
    await page.getByRole("button", { name: "Open my dashboard" }).click();
    await expect(page.getByText(/portal ID and PIN/i)).toBeVisible();
  });

  test("forgot password without email prompts for email first", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText(/enter your business email first/i)).toBeVisible();
  });
});

test.describe("Password recovery view", () => {
  test("reset-password route renders recovery form", async ({ page }) => {
    await page.goto("/?reset-password=1");
    await expect(page.getByRole("heading", { name: "Set a new Financier password" })).toBeVisible();
    await expect(page.getByText("New password", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirm new password", { exact: true })).toBeVisible();
  });
});

test.describe("Login messages", () => {
  test("empty fields are outlined and wrong credentials get a plain explanation", async ({ page }) => {
    await page.route("**/api/auth/**", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid login credentials" }) }));
    await page.goto("/");
    await page.getByRole("button", { name: /^Sign in/ }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("A few details are missing");
    await expect(page.getByLabel("Business email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Business email")).toBeFocused();
    await page.getByLabel("Business email").fill("owner@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Secure@2026");
    await page.getByRole("button", { name: /^Sign in/ }).click();
    await expect(alert).toContainText("Couldn't sign you in");
    await expect(alert).toContainText("The email or password is incorrect");
  });
});
