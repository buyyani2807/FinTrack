# Executive summary

**No-go for a broad commercial launch.**

Staging on 21 Oct 2026, financier session, Buyyani's Enterprises. Local unit tests passed. The live site still fails the default payroll post for a month that has not ended.

## Readiness

Weighted score from evidence in `market-readiness.md`: **58 / 100**. Band: below 60, not ready for a broad launch. The score does not override the payroll blocker.

## What was proven

- Buyyani's Enterprises trial balance is ₹18,03,250.07 debit and the same credit. Difference ₹0.
- November 2026 payroll on that company still fills pay date **30 Nov 2026**. The date field has no maximum. Today is 21 Oct 2026. That date is in the future, so posting is refused. Not posted. Month was returned to October.
- Cashbook still shows cash ₹-27,49,000, bank ₹24,00,500, UPI ₹15,59,500, total ₹12,11,000, with today in and out at ₹0. The words "Brought forward" are not on the page, so the local cashbook fix is not deployed.
- `npm test`: 517 passed, 2 skipped, 0 failed, on commit `fe24657`.

## Critical and high defects

| ID | Severity | Status on staging |
| --- | --- | --- |
| BY-01 | P1 | Open. November pay date is 30 Nov 2026. |
| BY-04 | P2 | Open. Today list does not explain the cash balance. A load can show ₹0 before data arrives. Fix is local only. |
| BY-05 | P3 | Open on posted books. Output CGST and SGST still differ by one paisa until those vouchers are re-posted. New invoices in `fe24657` keep the halves equal. Not deployed. |

No P0 was observed: trial balance difference stayed ₹0, and this pass did not lose or duplicate a voucher.

## Follow-up the same afternoon

These checks used the same financier session. No application code was changed.

- New daily loan `E2E-TEST-20261021`: ₹100 financed, ₹100 paid to the customer, daily collection ₹1 for 100 days, status active, nothing received. Collect stays disabled until the next day. This posts a ₹100 cash disbursement.
- Auction chit `E2E-TEST-20261021`: value ₹1,000, 2 members, installment ₹500, commission 5%. Activated. Live bidding opened for month 1 (commission ₹50, bids above ₹50 and at most ₹300, payout band 70–95%). No member bid was posted. Bidding was paused. End bidding stayed disabled with no leading bid.
- Trial balance export for FY 2026–27 was opened. CSV totals are ₹18,18,250.08 debit and the same credit. Excel is a real workbook. PDF starts as a PDF. Output CGST and output SGST net to the same credit.
- WhatsApp settings opened. Templates are editable. Nothing was sent.
- Collection Staff lists existing agents. The new loan is not assigned. Assignments were not saved. Route collections were not recorded. Agent login was not used.
- Logout is on screen. It was not clicked, because this is the only session and there is no password to sign back in.
- Accountant, viewer, agent, customer, and chit-member sign-in were not run.

## Not verified

Other roles, logout completion, signup, password reset, a member bid on the live auction, an agent recording a collection, a WhatsApp send, bank-file matching on Buyyani, period lock, and backup restore. Playwright was not re-run.

## Highest competitive gaps

Official Zoho Books and Vyapar pages, and a Tally partner description of TallyPrime 6.0, advertise GST return filing, e-invoice, and bank feeds. FinTrack prepares GST reports and can import a bank file. It does not file returns or pull live bank feeds. Daily finance, monthly finance, and chit fund are FinTrack's own scope. Those competitors are not chit-fund products.

## Remediation order

1. Deploy `fe24657` to staging and re-open November payroll on Buyyani's Enterprises. Confirm the pay date is today.
2. On that deploy, confirm Cashbook shows Brought forward when Today is empty, and does not flash ₹0 as the real balance.
3. Leave existing Buyyani GST vouchers as they are. New invoices pick up the equal split only after deploy.
4. Then sign in as accountant, viewer, and agent, and post one member bid on the synthetic auction, before calling the rest of the product ready.
