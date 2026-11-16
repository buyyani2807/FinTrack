import { test, expect } from "@playwright/test";
import { mockAccountsWorkspace } from "./fixtures/accountsMocks.js";

const trackErrors = page => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
};

const openPayroll = async (page, child) => {
  await page.goto("/accounting");
  const tabs = page.getByRole("navigation", { name: "Accounts sections" });
  await expect(tabs).toBeVisible({ timeout: 15_000 });
  await tabs.getByRole("button", { name: "Payroll", exact: true }).click();
  if (child) await page.locator(".acc-subsection-nav").getByRole("button", { name: child, exact: true }).click();
  await expect(page.locator(".acc-panel").first()).toBeVisible();
};

test.describe("Payroll", () => {
  test("pay shows salaried and daily-wage staff with overtime and loan recovery", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await openPayroll(page, "Pay");
    const table = page.locator(".pay-register-table");
    const anita = table.getByRole("row", { name: /Anita Rao/ });
    // 24,000 less one absent day (800), plus 2 overtime hours (200), less 2,000 deductions and a 2,500 loan instalment.
    await expect(anita).toContainText("₹18,900");
    await expect(anita).toContainText("₹4,500");
    const ravi = table.getByRole("row", { name: /Ravi Kumar/ });
    await expect(ravi).toContainText("₹600 a day");
    // 26 working days in September 2026, less the company holiday.
    await expect(ravi).toContainText("25 worked");
    await expect(ravi).toContainText("₹15,000");

    await anita.getByRole("button", { name: "This month" }).click();
    const month = page.getByRole("dialog", { name: /September 2026 · Anita Rao/ });
    await expect(month.getByText(/Loan of .* outstanding/)).toBeVisible();
    await month.getByLabel("Bonus").fill("1000");
    await month.getByRole("button", { name: "Use for this month" }).click();
    await expect(anita).toContainText("₹19,900");

    await anita.getByRole("button", { name: "Payslip" }).click();
    const slip = page.getByRole("dialog", { name: /Payslip · Anita Rao/ });
    await expect(slip.getByText("Advance or loan recovery")).toBeVisible();
    await expect(slip.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(slip.getByRole("button", { name: "Send on WhatsApp" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the employee panel shows details, pay, history and leaving", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await openPayroll(page, "Pay");
    await page.locator(".pay-register-table").getByRole("row", { name: /Anita Rao/ }).getByRole("button", { name: "Open" }).click();
    const panel = page.getByRole("dialog", { name: "Anita Rao" });
    await expect(panel.getByLabel("IFSC")).toHaveValue("HDFC0001234");
    await panel.getByRole("tab", { name: "Pay", exact: true }).click();
    await expect(panel.getByLabel("Basic")).toHaveValue("18000");
    await expect(panel.getByText("Take-home")).toBeVisible();
    await panel.getByRole("tab", { name: "Pay history" }).click();
    await expect(panel.getByText("Annual raise")).toBeVisible();
    await expect(panel.getByText("+₹4,000 (20%)")).toBeVisible();
    await panel.getByRole("tab", { name: "Leaving" }).click();
    await expect(panel.getByText(/Gratuity estimate: ₹/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Settle and close" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("attendance, leave, advances and staff app render their new parts", async ({ page }) => {
    const errors = trackErrors(page);
    await mockAccountsWorkspace(page);
    await openPayroll(page, "Attendance");
    await expect(page.getByText("Founders day").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Punches from the staff app" })).toBeVisible();
    await expect(page.getByRole("button", { name: "In photo" })).toBeVisible();

    await page.locator(".acc-subsection-nav").getByRole("button", { name: "Leave", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Leave requests from the staff app" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByText("10 left of 12")).toBeVisible();

    await page.locator(".acc-subsection-nav").getByRole("button", { name: "Advances", exact: true }).click();
    await expect(page.getByText("Festival loan")).toBeVisible();
    await expect(page.getByText("₹2,500 a month · 3 months left")).toBeVisible();

    await page.locator(".acc-subsection-nav").getByRole("button", { name: "Staff app", exact: true }).click();
    await expect(page.getByText("ST-1A2B3C4D")).toBeVisible();
    await expect(page.getByRole("button", { name: "New PIN" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the staff app signs in and shows the punch button, attendance and payslips", async ({ page }) => {
    const errors = trackErrors(page);
    let signedIn = false;
    await page.route("**/api/staff/home", route => (signedIn
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        today: "2026-09-30",
        month: "2026-09-01",
        employee: { party_id: "p3", name: "Anita Rao", company: "E2E Traders", staff_id: "ST-1A2B3C4D" },
        profile: { pay_type: "monthly", paid_leave_quota: 12, sick_leave_quota: 6 },
        punch: null,
        days: [{ party_id: "p3", work_date: "2026-09-02", status: "absent", hours: 0, overtime_hours: 0 }],
        leave: [], leave_used: [{ party_id: "p3", leave_type: "paid", days: 2 }], holidays: [], punches: [],
        payslips: [{ period_month: "2026-08-01", pay_date: "2026-08-31", line: { partyId: "p3", name: "Anita Rao", basic: 18000, hra: 6000, allowance: 0, gross: 24000, earned: 24000, paidDays: 31, basis: 31, lopDays: 0, deductions: { pf: 1800, professionalTax: 200 }, deductionTotal: 2000, net: 22000, voucherId: "v1" } }],
        requests: [], advance_outstanding: 7500,
      }) })
      : route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in again." }) })));
    await page.route("**/api/staff/login", route => { signedIn = true; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }); });
    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Staff ID").fill("st-1a2b3c4d");
    await page.getByLabel("PIN").fill("123456");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Anita Rao" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Punch in" })).toBeVisible();
    await expect(page.getByText("Paid leave left")).toBeVisible();
    await page.getByRole("button", { name: /August 2026/ }).click();
    await expect(page.getByRole("dialog", { name: /Payslip August 2026/ }).getByText("Net pay")).toBeVisible();
    // The 401 before sign-in is expected; nothing else may error.
    expect(errors.filter(text => !/401/.test(text))).toEqual([]);
  });
});
