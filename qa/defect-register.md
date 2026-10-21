# Defect register

Environment: staging, 21 Oct 2026, financier, Buyyani's Enterprises. Browser: Cursor embedded browser, desktop. Application commit on the server was not readable. Local commit `fe24657` contains fixes that staging does not show.

## BY-01 — Payroll date is the month end

- Severity: P1. Reproducible.
- Page: `/accounting/payroll`
- Preconditions: Buyyani's Enterprises, November 2026, no post clicked.
- Steps: Open Payroll. Choose November 2026. Read the pay date.
- Expected: Pay date is today (21 Oct 2026) or earlier, and the field rejects a later date.
- Actual: Pay date **2026-11-30**. The date input has no `max`. Posting that date is refused because a voucher date cannot be in the future.
- Evidence: live page read this pass. Month was set back to October. No salary posted.
- Suspected cause, unconfirmed on the server: staging bundle is older than `defaultPayDate` in `fe24657`.
- Impact: the default path for paying a current month fails until someone edits the date.
- Remediation: deploy `fe24657`. Re-test November on Buyyani's Enterprises.
- Regression: `tests/accounts.payroll.test.js` case "pay date uses today when the month has not ended".
- Blocks launch: yes.

## BY-04 — Cashbook today view does not explain the balance

- Severity: P2. Reproducible for the missing brought-forward line. The ₹0 flash was seen on 20 Oct and is not re-proven as data loss.
- Page: `/cashbook/cashbook`
- Steps: Open Cashbook. Leave the period on Today.
- Expected: the all-time cash figure is visible, and the list shows that it comes from earlier entries. While entries are loading, the page does not present ₹0 as the balance.
- Actual this pass: cash ₹-27,49,000, bank ₹24,00,500, UPI ₹15,59,500, all money ₹12,11,000, today in ₹0, today out ₹0. The page does not contain "Brought forward".
- Impact: an owner cannot see which entries produced the negative cash without changing the date filter. The arithmetic of the three balances is consistent (they add to ₹12,11,000).
- Remediation: deploy the cashbook changes in `fe24657`.
- Regression: `tests/cashbook.test.js` case "a period with no rows still carries the earlier balance".
- Blocks launch: no. The figures add up.

## BY-05 — Output CGST and SGST differ by one paisa

- Severity: P3. Confirmed on 20 Oct on the Buyyani balance sheet. Not re-opened this pass.
- Expected: intra-state CGST equals SGST.
- Actual on the posted books: output CGST ₹67,464.80, output SGST ₹67,464.79. Assets still equalled liabilities and equity.
- Cause of new invoices, confirmed in code at `fe24657`: `gstSplit` now gives both halves the lower paisa. Already posted vouchers are unchanged.
- Remediation: deploy for new invoices. Do not rewrite posted Buyyani vouchers unless you approve a one-paisa adjustment.
- Regression: `tests/accounts.accounting.test.js` case "intra GST drops an odd paisa so CGST and SGST stay equal".
- Blocks launch: no.
