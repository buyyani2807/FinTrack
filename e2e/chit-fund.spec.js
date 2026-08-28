import { test, expect } from "@playwright/test";

const makeE2eToken = (sub = "e2e-user") => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return `${header}.${payload}.e2e`;
};

const emptyChitBoard = {
  cycles: [],
  enrollments: [],
  fixedLifts: [],
  predefinedSchedule: [],
};

async function mockFinancierSession(page) {
  const token = makeE2eToken();

  await page.route("**/api/auth/session", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: token, expires_in: 3600 }),
    });
  });

  await page.route("**/rest/v1/**", async route => {
    const url = route.request().url();
    if (url.includes("/profiles?")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "e2e-user",
          full_name: "E2E Owner",
          role: "owner",
          is_active: true,
          organizations: { name: "E2E Finance" },
        }]),
      });
    }
    if (url.includes("/finance_accounts?") || url.includes("/chit_schemes?") || url.includes("/chit_cycles?")
      || url.includes("/chit_enrollments?") || url.includes("/fixed_chit_lifts?") || url.includes("/predefined_chit_schedule?")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/rest/v1/rpc/**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  return { token, ...emptyChitBoard };
}

test.describe("Chit Fund workspace", () => {
  test("opens Chit Fund without runtime errors", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await mockFinancierSession(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Chit Fund" }).click();
    await expect(page.getByRole("heading", { name: "Chit Fund", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New scheme" })).toBeVisible();
    await expect(page.getByText("Auction Chits")).toBeVisible();
    await expect(page.getByText("Fixed Chits")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
